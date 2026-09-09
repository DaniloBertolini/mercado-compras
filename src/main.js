(function(){
  "use strict";

  const STORAGE_KEY = "conferelista_v1";

  // overrides: id da linha do cupom -> id do item planejado que o usuário
  // escolheu à mão (ou null para "isto não estava na lista").
  const defaultState = { step: 1, planned: [], bought: [], overrides: {} };
  let state = load();

  function uid(){
    return Math.random().toString(36).slice(2, 10);
  }

  // Os ajustes manuais apontam para itens, não para posições: sem id próprio,
  // remover um item da lista faria todos os ajustes seguintes escorregarem.
  // Listas salvas antes disso são migradas aqui, na primeira leitura.
  function ensureIds(st){
    if(!Array.isArray(st.planned)) st.planned = [];
    if(!Array.isArray(st.bought)) st.bought = [];
    if(!st.overrides || typeof st.overrides !== 'object') st.overrides = {};

    st.planned.forEach(item => { if(!item.id) item.id = uid(); });
    st.bought.forEach(item => { if(!item.id) item.id = uid(); });

    // ajuste que aponta para item já apagado vira lixo silencioso
    const plannedIds = new Set(st.planned.map(p => p.id));
    const boughtIds = new Set(st.bought.map(b => b.id));
    Object.keys(st.overrides).forEach(boughtId => {
      const target = st.overrides[boughtId];
      if(!boughtIds.has(boughtId) || (target !== null && !plannedIds.has(target))){
        delete st.overrides[boughtId];
      }
    });
    return st;
  }

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return ensureIds({ ...structuredClone(defaultState), ...parsed });
    }catch(e){
      return structuredClone(defaultState);
    }
  }

  function save(){
    ensureIds(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function fmtBRL(n){
    return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function normalize(str){
    return str.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  }

  // Mercados abreviam nomes no cupom (ex: "DESOD" em vez de "desodorante") e trocam
  // a ordem das palavras (ex: "TOALHA PAPEL" em vez de "papel toalha"). Por isso o
  // match compara palavra por palavra, aceitando quando uma é prefixo da outra,
  // em vez de exigir que o nome inteiro apareça igual dentro do outro.
  const STOPWORDS = new Set(['de','da','do','das','dos','com','sem','para','por','em','no','na','e','ou']);
  const TOKEN_MIN_LEN = 3;

  function tokenize(str){
    return normalize(str).split(/[^a-z0-9]+/).filter(t => t.length >= TOKEN_MIN_LEN && !STOPWORDS.has(t));
  }

  // O cupom abrevia ("DESOD" por "desodorante"), então prefixo precisa contar —
  // mas menos que a palavra inteira. Sem esse desnível, "BISC MINUETO CHOC/BAUN"
  // disputa a palavra "chocolate" de igual para igual com o chocolate de verdade.
  const PREFIX_WEIGHT = 0.6;

  function tokenScore(a, b){
    if(a === b) return 1;
    if(a.startsWith(b) || b.startsWith(a)) return PREFIX_WEIGHT;
    return 0;
  }

  // Média, entre as palavras do nome planejado, do quanto cada uma encontrou
  // correspondente no nome do cupom.
  function matchScore(plannedTokens, boughtTokens){
    if(!plannedTokens.length || !boughtTokens.length) return 0;
    const sum = plannedTokens.reduce(
      (acc, pt) => acc + Math.max(...boughtTokens.map(bt => tokenScore(pt, bt))),
      0
    );
    return sum / plannedTokens.length;
  }

  // Item vendido por peso vem do cupom como 0,376 kg × preço do quilo. Para
  // contagem ele vale uma unidade, senão três bandejas de bife viram "1,25 un".
  function unitsOf(b){
    return b.isWeight ? 1 : (b.qty || 1);
  }

  function totalOf(b){
    return (b.qty || 1) * b.price;
  }

  function qtyLabel(b){
    const qty = b.qty || 1;
    return b.isWeight
      ? `${qty.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
      : `x${Math.round(qty)}`;
  }

  // Distribui as linhas do cupom entre os itens planejados. Cada linha pertence
  // a UM planejado: em vez de o primeiro da lista levar tudo que parece com ele,
  // monta todos os pares possíveis e distribui do par mais forte para o mais
  // fraco, respeitando a quantidade que foi planejada.
  const MATCH_THRESHOLD = 0.6;

  function assignBought(planned, bought, overrides){
    const pool = bought.map((b, i) => ({ ...b, _idx: i, _tokens: tokenize(b.name) }));
    const slots = planned.map(p => ({
      item: p,
      tokens: tokenize(p.name),
      total: p.qty * p.price,
      matches: [],
      units: 0,
    }));
    const slotById = new Map(slots.map(s => [s.item.id, s]));

    const takenBy = new Map();
    const wantedBy = new Map(); // quem queria a linha mas já tinha atingido a qtd
    const forced = new Set();

    // O que o usuário ajustou à mão manda e sai da disputa automática, inclusive
    // furando o limite de quantidade — se ele apontou para ali, é ali.
    pool.forEach(b => {
      if(!overrides || !Object.prototype.hasOwnProperty.call(overrides, b.id)) return;
      const target = overrides[b.id];
      if(target === null){        // marcado à mão como fora da lista
        forced.add(b._idx);
        b._manual = true;
        return;
      }
      const slot = slotById.get(target);
      if(!slot) return;           // planejado sumiu: deixa o automático decidir
      b._manual = true;
      slot.matches.push(b);
      slot.units += unitsOf(b);
      takenBy.set(b._idx, slot);
    });

    const pairs = [];
    slots.forEach((slot, si) => {
      pool.forEach(b => {
        if(takenBy.has(b._idx) || forced.has(b._idx)) return;
        const score = matchScore(slot.tokens, b._tokens);
        if(score >= MATCH_THRESHOLD){
          pairs.push({ si, b, score, priceGap: Math.abs(totalOf(b) - slot.total) });
        }
      });
    });

    // Nome manda; empatou no nome, leva quem tem o preço mais parecido. É esse
    // desempate que separa três bandejas de bife anunciadas por peso diferente,
    // e que faz o removedor com acetona preferir a linha "acetona" à "esmalte".
    pairs.sort((x, y) => y.score - x.score || x.priceGap - y.priceGap);

    pairs.forEach(pair => {
      if(takenBy.has(pair.b._idx)) return;
      const slot = slots[pair.si];
      if(slot.units >= slot.item.qty){
        if(!wantedBy.has(pair.b._idx)) wantedBy.set(pair.b._idx, slot);
        return;
      }
      slot.matches.push(pair.b);
      slot.units += unitsOf(pair.b);
      takenBy.set(pair.b._idx, slot);
    });

    const leftovers = pool
      .filter(b => !takenBy.has(b._idx))
      .map(b => ({ ...b, _wantedBy: wantedBy.get(b._idx) || null }));

    return { slots, leftovers };
  }

  function parseBRLNumber(str){
    if(str == null) return NaN;
    let s = String(str).trim();
    if(s.includes(',')){
      s = s.replace(/\./g, '').replace(',', '.');
    }
    return parseFloat(s);
  }

  // ---------- Import from nota text ----------
  // Portais de NFC-e costumam listar cada item em blocos como:
  //   NOME DO PRODUTO (Código: 12345 )
  //   Qtde.:1  UN: UN1  Vl. Unit.:   19,99   Vl. Total
  //   19,99
  // ou seja: o rótulo "Vl. Total" vem numa linha e o valor sozinho na linha seguinte.
  const CODE_STRIP_RE = /\s*\(c[oó]digo:?\s*\d+\s*\)\s*/i;
  const QTY_RE = /qtde\.?:?\s*([\d.,]+)/i;
  const UNIT_RE = /vl\.?\s*unit(?:[aá]rio)?\.?:?\s*([\d.,]+)/i;
  const TOTAL_RE = /vl\.?\s*total:?\s*([\d.,]+)/i;
  const TOTAL_LABEL_ONLY_RE = /vl\.?\s*total\s*$/i;
  const BARE_NUMBER_RE = /^[\d.,]+$/;
  const WEIGHT_RE = /un:\s*kg/i;
  const LABEL_RE = /^(c[oó]digo|qtde|un\b|un:|un\.|vl\.|valor|desconto|item\s*\d|total\s*da\s*nota|consumidor|emitente|chave|protocolo)/i;

  // Retorna um bloco por linha de item (não expandido em unidades) — quem chama decide
  // como transformar cada bloco em entradas de `state.bought` (ver expandForBought).
  function parseNotaText(text){
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    let current = null;
    let expectTotalNext = false;

    function finalizeCurrent(){
      if(current && current.name && (current.unit != null || current.total != null)){
        items.push(current);
      }
      current = null;
      expectTotalNext = false;
    }

    for(const line of lines){
      if(expectTotalNext && BARE_NUMBER_RE.test(line)){
        if(current) current.total = parseBRLNumber(line);
        finalizeCurrent();
        continue;
      }
      expectTotalNext = false;

      const qtyM = line.match(QTY_RE);
      const unitM = line.match(UNIT_RE);
      const totalM = line.match(TOTAL_RE);

      if(qtyM || unitM || totalM){
        if(!current) current = { name: null, qty: null, unit: null, total: null, isWeight: false };
        if(qtyM) current.qty = parseBRLNumber(qtyM[1]);
        if(unitM) current.unit = parseBRLNumber(unitM[1]);
        if(totalM) current.total = parseBRLNumber(totalM[1]);
        if(WEIGHT_RE.test(line)) current.isWeight = true;
        if(!totalM && TOTAL_LABEL_ONLY_RE.test(line)){
          expectTotalNext = true;
        } else {
          finalizeCurrent();
        }
        continue;
      }

      if(LABEL_RE.test(line)) continue;

      // linha de nome de produto
      if(current && current.name) current = null;
      const cleanName = line.replace(CODE_STRIP_RE, '').trim();
      if(!cleanName) continue;
      if(!current) current = { name: null, qty: null, unit: null, total: null, isWeight: false };
      current.name = current.name ? current.name + ' ' + cleanName : cleanName;
    }

    return items;
  }

  // Um bloco vira uma única entrada de `state.bought` com a quantidade já embutida
  // (ex: 12 hambúrgueres = 1 entrada com qty:12), guardando o preço por unidade —
  // assim compara certo com o preço unitário do planejado, e o total é qty * price.
  function blockToBoughtEntry(item){
    const qty = item.qty || 1;
    const price = item.unit != null ? item.unit : (item.total != null ? item.total / qty : 0);
    const entry = { id: uid(), name: item.name, qty, price: Math.round(price * 100) / 100 };
    // por peso o preço guardado é o do quilo, então a marca precisa sobreviver
    // para o total e a contagem saírem certos depois
    if(item.isWeight) entry.isWeight = true;
    return entry;
  }

  // ---------- Backup (exportar / importar entre aparelhos) ----------
  // O estado é só um JSON, então o "código" exportado é o próprio JSON numa linha:
  // dá para colar no WhatsApp ou salvar como arquivo, e a importação aceita os dois.
  const BACKUP_VERSION = 1;

  function buildBackupText(){
    return JSON.stringify({
      app: 'conferelista',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      state,
    });
  }

  // Nunca confia no que veio de fora: o texto pode ter sido truncado no meio do
  // caminho (WhatsApp, e-mail) ou editado à mão.
  function sanitizeItems(arr, forcedQty){
    if(!Array.isArray(arr)) return [];
    return arr.map(raw => {
      if(!raw || typeof raw !== 'object') return null;
      const name = String(raw.name == null ? '' : raw.name).trim();
      const price = Number(raw.price);
      if(!name || !isFinite(price)) return null;
      const qty = Number(raw.qty);
      const item = { id: typeof raw.id === 'string' && raw.id ? raw.id : uid(), name, price };
      if(isFinite(qty) && qty > 0) item.qty = qty;
      else if(forcedQty) item.qty = 1;
      if(raw.isWeight === true) item.isWeight = true;
      return item;
    }).filter(Boolean);
  }

  function parseBackupText(text){
    const raw = String(text || '').trim();
    if(!raw) throw new Error('Cole o código exportado antes de importar.');

    let data;
    try{
      data = JSON.parse(raw);
    }catch(e){
      throw new Error('Código inválido — copie o texto inteiro, do "{" até o "}" final.');
    }

    const payload = data && typeof data === 'object' && data.state && typeof data.state === 'object'
      ? data.state
      : data;

    if(!payload || typeof payload !== 'object' || (!Array.isArray(payload.planned) && !Array.isArray(payload.bought))){
      throw new Error('Não encontrei nenhuma lista nesse código.');
    }

    // ensureIds descarta sozinho os ajustes que apontarem para itens que não
    // sobreviveram à limpeza acima
    const imported = ensureIds({
      step: [1,2,3].includes(Number(payload.step)) ? Number(payload.step) : 1,
      planned: sanitizeItems(payload.planned, true),
      bought: sanitizeItems(payload.bought, false),
      overrides: payload.overrides && typeof payload.overrides === 'object'
        ? { ...payload.overrides }
        : {},
    });

    if(!imported.planned.length && !imported.bought.length){
      throw new Error('O código foi lido, mas as duas listas estão vazias.');
    }
    return imported;
  }

  function applyBackup(imported){
    const hasData = state.planned.length || state.bought.length;
    const resumo = `${imported.planned.length} item(ns) planejado(s) e ${imported.bought.length} pago(s)`;
    const aviso = hasData
      ? `Importar ${resumo}?\n\nIsto SUBSTITUI a lista que já está neste aparelho.`
      : `Importar ${resumo}?`;
    if(!confirm(aviso)) return false;

    state = imported;
    save();
    renderAll();
    return true;
  }

  // ---------- Elements ----------
  const screens = {
    1: document.getElementById('screen-planned'),
    2: document.getElementById('screen-bought'),
    3: document.getElementById('screen-compare'),
  };
  const stepTags = document.querySelectorAll('[data-step-tag]');

  const listPlannedEl = document.getElementById('list-planned');
  const emptyPlannedEl = document.getElementById('empty-planned');
  const totalPlannedEl = document.getElementById('total-planned');
  const formPlanned = document.getElementById('form-planned');
  const btnFinishPlanned = document.getElementById('btn-finish-planned');

  const listBoughtEl = document.getElementById('list-bought');
  const emptyBoughtEl = document.getElementById('empty-bought');
  const totalBoughtEl = document.getElementById('total-bought');
  const formBought = document.getElementById('form-bought');
  const btnFinishBought = document.getElementById('btn-finish-bought');
  const btnBackPlanned = document.getElementById('btn-back-planned');

  const compareListEl = document.getElementById('compare-list');
  const summaryEl = document.getElementById('summary');
  const btnReset = document.getElementById('btn-reset');
  const btnBackBought = document.getElementById('btn-back-bought');
  const btnToggleAdjust = document.getElementById('btn-toggle-adjust');
  const btnClearAdjust = document.getElementById('btn-clear-adjust');

  // só visual: não vai para o localStorage, cada visita começa lendo, não editando
  let adjusting = false;

  const importLinkEl = document.getElementById('import-link');
  const btnOpenLink = document.getElementById('btn-open-link');
  const importTextEl = document.getElementById('import-text');
  const btnParseText = document.getElementById('btn-parse-text');
  const previewListEl = document.getElementById('preview-list');
  const importEmptyEl = document.getElementById('import-empty');
  const btnConfirmImport = document.getElementById('btn-confirm-import');

  const backupTextEl = document.getElementById('backup-text');
  const backupStatusEl = document.getElementById('backup-status');
  const backupFileEl = document.getElementById('backup-file');
  const btnCopyBackup = document.getElementById('btn-copy-backup');
  const btnDownloadBackup = document.getElementById('btn-download-backup');
  const btnImportText = document.getElementById('btn-import-text');

  let previewItems = [];

  // ---------- Rendering ----------
  function renderStep(){
    Object.entries(screens).forEach(([num, el]) => {
      el.classList.toggle('active', Number(num) === state.step);
    });
    stepTags.forEach(tag => {
      tag.classList.toggle('active', Number(tag.dataset.stepTag) === state.step);
    });
  }

  function renderPlanned(){
    listPlannedEl.innerHTML = '';
    emptyPlannedEl.style.display = state.planned.length ? 'none' : 'block';
    let total = 0;
    state.planned.forEach((item, idx) => {
      total += item.qty * item.price;
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="qty">x${item.qty}</span>
        <span class="price">${fmtBRL(item.price)}</span>
        <button class="rm" data-idx="${idx}" title="remover">×</button>
      `;
      listPlannedEl.appendChild(li);
    });
    totalPlannedEl.textContent = fmtBRL(total);
    btnFinishPlanned.disabled = state.planned.length === 0;
  }

  function renderBought(){
    listBoughtEl.innerHTML = '';
    emptyBoughtEl.style.display = state.bought.length ? 'none' : 'block';
    let total = 0;
    state.bought.forEach((item, idx) => {
      total += totalOf(item);
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="qty">${qtyLabel(item)}</span>
        <span class="price">${fmtBRL(totalOf(item))}</span>
        <button class="rm" data-idx="${idx}" title="remover">×</button>
      `;
      listBoughtEl.appendChild(li);
    });
    totalBoughtEl.textContent = fmtBRL(total);
    btnFinishBought.disabled = state.bought.length === 0;
  }

  function renderPreview(){
    previewListEl.innerHTML = '';
    importEmptyEl.style.display = previewItems.length ? 'none' : 'block';
    previewItems.forEach((item, idx) => {
      const qty = item.qty || 1;
      const total = item.total != null ? item.total : (item.unit || 0) * qty;
      const li = document.createElement('li');
      li.innerHTML = `
        <label>
          <input type="checkbox" data-idx="${idx}" ${item.checked ? 'checked' : ''}>
          <span class="name">${escapeHtml(item.name)} <span class="qty">${qtyLabel(item)}</span></span>
        </label>
        <span class="price">${fmtBRL(total)}</span>
      `;
      previewListEl.appendChild(li);
    });
    btnConfirmImport.disabled = !previewItems.some(i => i.checked);
  }

  // Seletor de destino de cada linha do cupom. Escolhi <select> em vez de
  // arrastar porque no celular o nativo abre em tela cheia — alvo grande para
  // o dedo — e não briga com a rolagem da página.
  function reassignHtml(b, currentPlannedId){
    const opts = state.planned.map(p => `
      <option value="${p.id}"${p.id === currentPlannedId ? ' selected' : ''}>
        ${escapeHtml(p.name)} · ${fmtBRL(p.price)}
      </option>
    `).join('');
    return `
      <select class="reassign" data-bought-id="${b.id}" aria-label="mudar a que item planejado esta linha pertence">
        ${opts}
        <option value=""${currentPlannedId == null ? ' selected' : ''}>— não estava na lista</option>
      </select>
    `;
  }

  function renderCompare(){
    compareListEl.innerHTML = '';

    const { slots, leftovers } = assignBought(state.planned, state.bought, state.overrides);

    compareListEl.classList.toggle('adjusting', adjusting);
    btnClearAdjust.style.display = Object.keys(state.overrides).length ? '' : 'none';

    let totalPlanned = 0, totalBought = 0, mismatches = 0;

    slots.forEach(slot => {
      const p = slot.item;
      const matches = slot.matches;
      const plannedTotal = slot.total;
      totalPlanned += plannedTotal;

      const row = document.createElement('div');
      row.className = 'compare-row';

      let boughtColHtml, colClass = '';

      if(matches.length){
        const matchedQty = slot.units;
        const matchedTotal = matches.reduce((s, m) => s + totalOf(m), 0);
        totalBought += matchedTotal;
        const diff = matchedTotal - plannedTotal;

        let tagHtml;
        if(Math.abs(diff) < 0.005){
          colClass = 'diff-ok';
          tagHtml = `<span class="tag ok">preço correto</span>`;
        } else if(diff > 0){
          colClass = 'diff-bad';
          mismatches++;
          tagHtml = `<span class="tag bad">+${fmtBRL(diff)} a mais</span>`;
        } else {
          colClass = 'diff-ok';
          tagHtml = `<span class="tag ok">${fmtBRL(Math.abs(diff))} a menos</span>`;
        }

        const qtyNoteHtml = matchedQty !== p.qty
          ? `<span class="tag missing">encontrado ${matchedQty}/${p.qty} un.</span>`
          : '';

        const itemsHtml = matches.map(m => `
          <div class="matched-item${m._manual ? ' manual' : ''}">
            <span class="name">${escapeHtml(m.name)}</span>
            <span class="qty">${qtyLabel(m)}</span>
            <span class="price">${fmtBRL(totalOf(m))}</span>
            ${reassignHtml(m, p.id)}
          </div>
        `).join('');

        boughtColHtml = `
          ${itemsHtml}
          <span class="meta"><span>total pago</span><span class="val">${fmtBRL(matchedTotal)}</span></span>
          ${tagHtml}
          ${qtyNoteHtml}
        `;
      } else {
        mismatches++;
        boughtColHtml = `
          <span class="name">—</span>
          <span class="meta"><span>não encontrado no cupom</span></span>
          <span class="tag missing">sem correspondência</span>
        `;
      }

      row.innerHTML = `
        <div class="col-planned">
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="meta"><span>x${p.qty} · anunciado</span><span class="val">${fmtBRL(plannedTotal)}</span></span>
        </div>
        <div class="col-bought ${colClass}">
          ${boughtColHtml}
        </div>
      `;
      compareListEl.appendChild(row);
    });

    // sobras: linhas do cupom que nenhum planejado levou
    leftovers.forEach(b => {
      totalBought += totalOf(b);

      // se algum planejado queria a linha mas já tinha completado a quantidade,
      // é excedente daquele item — bem diferente de uma compra fora da lista
      const excedente = b._wantedBy;
      const plannedColHtml = excedente
        ? `<span class="name">${escapeHtml(excedente.item.name)}</span>
           <span class="meta"><span>x${excedente.item.qty} já encontrados</span></span>`
        : `<span class="name">—</span>
           <span class="meta"><span>não estava na lista</span></span>`;
      const tagHtml = excedente
        ? `<span class="tag bad">além do planejado</span>`
        : `<span class="tag missing">item extra</span>`;

      const row = document.createElement('div');
      row.className = 'compare-row';
      row.innerHTML = `
        <div class="col-planned">
          ${plannedColHtml}
        </div>
        <div class="col-bought diff-bad${b._manual ? ' manual' : ''}">
          <span class="name">${escapeHtml(b.name)}</span>
          <span class="meta"><span>${qtyLabel(b)} · pago</span><span class="val">${fmtBRL(totalOf(b))}</span></span>
          ${tagHtml}
          ${reassignHtml(b, null)}
        </div>
      `;
      compareListEl.appendChild(row);
    });

    const totalDiff = totalBought - totalPlanned;
    summaryEl.innerHTML = `
      <div class="summary-row"><span>total anunciado</span><span>${fmtBRL(totalPlanned)}</span></div>
      <div class="summary-row"><span>total pago</span><span>${fmtBRL(totalBought)}</span></div>
      <div class="summary-row"><span>itens com preço divergente</span><span>${mismatches}</span></div>
      <div class="summary-row highlight">
        <span>${totalDiff > 0 ? 'você pagou a mais' : totalDiff < 0 ? 'você pagou a menos' : 'tudo bateu certinho'}</span>
        <span class="amt ${totalDiff > 0 ? 'bad' : 'ok'}">${fmtBRL(Math.abs(totalDiff))}</span>
      </div>
    `;
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderAll(){
    renderStep();
    renderPlanned();
    renderBought();
    if(state.step === 3) renderCompare();
  }

  // ---------- Events ----------
  formPlanned.addEventListener('submit', e => {
    e.preventDefault();
    const nameEl = document.getElementById('p-name');
    const qtyEl = document.getElementById('p-qty');
    const priceEl = document.getElementById('p-price');
    const name = nameEl.value.trim();
    const qty = Number(qtyEl.value) || 1;
    const price = Number(priceEl.value);
    if(!name || isNaN(price)) return;
    state.planned.push({ id: uid(), name, qty, price });
    save();
    renderPlanned();
    nameEl.value = ''; qtyEl.value = '1'; priceEl.value = '';
    nameEl.focus();
  });

  listPlannedEl.addEventListener('click', e => {
    const btn = e.target.closest('.rm');
    if(!btn) return;
    state.planned.splice(Number(btn.dataset.idx), 1);
    save();
    renderPlanned();
  });

  btnFinishPlanned.addEventListener('click', () => {
    if(state.planned.length === 0) return;
    state.step = 2;
    save();
    renderAll();
  });

  formBought.addEventListener('submit', e => {
    e.preventDefault();
    const nameEl = document.getElementById('b-name');
    const priceEl = document.getElementById('b-price');
    const name = nameEl.value.trim();
    const price = Number(priceEl.value);
    if(!name || isNaN(price)) return;
    state.bought.push({ id: uid(), name, price });
    save();
    renderBought();
    nameEl.value = ''; priceEl.value = '';
    nameEl.focus();
  });

  listBoughtEl.addEventListener('click', e => {
    const btn = e.target.closest('.rm');
    if(!btn) return;
    state.bought.splice(Number(btn.dataset.idx), 1);
    save();
    renderBought();
  });

  btnBackPlanned.addEventListener('click', () => {
    state.step = 1;
    save();
    renderAll();
  });

  btnFinishBought.addEventListener('click', () => {
    if(state.bought.length === 0) return;
    state.step = 3;
    save();
    renderAll();
  });

  btnBackBought.addEventListener('click', () => {
    state.step = 2;
    save();
    renderAll();
  });

  btnReset.addEventListener('click', () => {
    if(!confirm('Resetar tudo para a próxima compra?')) return;
    state = structuredClone(defaultState);
    save();
    renderAll();
  });

  btnToggleAdjust.addEventListener('click', () => {
    adjusting = !adjusting;
    btnToggleAdjust.classList.toggle('on', adjusting);
    btnToggleAdjust.textContent = adjusting ? '✓ terminei de ajustar' : '⇄ ajustar correspondências';
    renderCompare();
  });

  btnClearAdjust.addEventListener('click', () => {
    if(!confirm('Desfazer todos os ajustes manuais e voltar ao automático?')) return;
    state.overrides = {};
    save();
    renderCompare();
  });

  compareListEl.addEventListener('change', e => {
    const sel = e.target.closest('select.reassign');
    if(!sel) return;
    state.overrides[sel.dataset.boughtId] = sel.value === '' ? null : sel.value;
    save();
    renderCompare();
  });

  btnOpenLink.addEventListener('click', () => {
    const link = importLinkEl.value.trim();
    if(!link) return;
    window.open(link, '_blank', 'noopener');
  });

  btnParseText.addEventListener('click', () => {
    const parsed = parseNotaText(importTextEl.value);
    previewItems = parsed.map(p => ({ ...p, checked: true }));
    renderPreview();
  });

  previewListEl.addEventListener('change', e => {
    const chk = e.target.closest('input[type="checkbox"]');
    if(!chk) return;
    previewItems[Number(chk.dataset.idx)].checked = chk.checked;
    btnConfirmImport.disabled = !previewItems.some(i => i.checked);
  });

  btnConfirmImport.addEventListener('click', () => {
    previewItems.filter(i => i.checked).forEach(i => {
      state.bought.push(blockToBoughtEntry(i));
    });
    save();
    renderBought();
    previewItems = [];
    importTextEl.value = '';
    renderPreview();
  });

  // ---------- Backup events ----------
  function backupStatus(msg, kind){
    backupStatusEl.textContent = msg;
    backupStatusEl.className = 'backup-status' + (kind ? ' ' + kind : '');
  }

  // navigator.clipboard não existe fora de https/localhost (abrindo o arquivo
  // direto, por exemplo), então o texto fica selecionado como plano B.
  function copyToClipboard(text){
    if(navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text).then(() => true, () => selectFallback());
    }
    return Promise.resolve(selectFallback());
  }

  function selectFallback(){
    backupTextEl.focus();
    backupTextEl.setSelectionRange(0, backupTextEl.value.length);
    try{
      return document.execCommand('copy');
    }catch(e){
      return false;
    }
  }

  btnCopyBackup.addEventListener('click', () => {
    const text = buildBackupText();
    backupTextEl.value = text;
    copyToClipboard(text).then(ok => {
      backupStatus(
        ok ? 'Código copiado — cole no outro aparelho e toque em importar.'
           : 'O texto está selecionado aí em cima: copie manualmente.',
        ok ? 'ok' : 'bad'
      );
    });
  });

  btnDownloadBackup.addEventListener('click', () => {
    const blob = new Blob([buildBackupText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conferelista-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    backupStatus('Arquivo gerado — mande para o outro aparelho e use "abrir arquivo".', 'ok');
  });

  btnImportText.addEventListener('click', () => {
    try{
      if(applyBackup(parseBackupText(backupTextEl.value))){
        backupTextEl.value = '';
        backupStatus('Listas importadas.', 'ok');
      }
    }catch(err){
      backupStatus(err.message, 'bad');
    }
  });

  backupFileEl.addEventListener('change', () => {
    const file = backupFileEl.files && backupFileEl.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        if(applyBackup(parseBackupText(reader.result))){
          backupTextEl.value = '';
          backupStatus(`Listas importadas de ${file.name}.`, 'ok');
        }
      }catch(err){
        backupStatus(err.message, 'bad');
      }
      backupFileEl.value = '';
    };
    reader.onerror = () => {
      backupStatus('Não consegui ler o arquivo.', 'bad');
      backupFileEl.value = '';
    };
    reader.readAsText(file);
  });

  renderAll();
})();
