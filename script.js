(function(){
  "use strict";

  const STORAGE_KEY = "conferelista_v1";

  const defaultState = { step: 1, planned: [], bought: [] };
  let state = load();

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(defaultState), ...parsed };
    }catch(e){
      return structuredClone(defaultState);
    }
  }

  function save(){
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

  function tokensMatch(a, b){
    return a.startsWith(b) || b.startsWith(a);
  }

  // Fração das palavras do nome planejado que encontraram alguma palavra
  // correspondente (por prefixo) no nome do cupom.
  function matchScore(plannedTokens, boughtTokens){
    if(!plannedTokens.length) return 0;
    const matched = plannedTokens.filter(pt => boughtTokens.some(bt => tokensMatch(pt, bt))).length;
    return matched / plannedTokens.length;
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
    return { name: item.name, qty, price: Math.round(price * 100) / 100 };
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

  const importLinkEl = document.getElementById('import-link');
  const btnOpenLink = document.getElementById('btn-open-link');
  const importTextEl = document.getElementById('import-text');
  const btnParseText = document.getElementById('btn-parse-text');
  const previewListEl = document.getElementById('preview-list');
  const importEmptyEl = document.getElementById('import-empty');
  const btnConfirmImport = document.getElementById('btn-confirm-import');

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
      const qty = item.qty || 1;
      total += qty * item.price;
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="qty">x${qty}</span>
        <span class="price">${fmtBRL(item.price)}</span>
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
      const qtyLabel = item.isWeight ? `${qty} kg` : `x${Math.round(qty)}`;
      const li = document.createElement('li');
      li.innerHTML = `
        <label>
          <input type="checkbox" data-idx="${idx}" ${item.checked ? 'checked' : ''}>
          <span class="name">${escapeHtml(item.name)} <span class="qty">${qtyLabel}</span></span>
        </label>
        <span class="price">${fmtBRL(total)}</span>
      `;
      previewListEl.appendChild(li);
    });
    btnConfirmImport.disabled = !previewItems.some(i => i.checked);
  }

  function renderCompare(){
    compareListEl.innerHTML = '';

    const boughtPool = state.bought.map((b, i) => ({...b, _used:false, _idx:i}));

    // Junta TODAS as linhas do cupom cujo nome contém o nome planejado (ex: as duas
    // pizzas de sabores diferentes contam juntas para a linha "pizza" do planejado).
    // Considera correspondência quando pelo menos 60% das palavras do item
    // planejado batem (por prefixo) com palavras do nome do cupom.
    const MATCH_THRESHOLD = 0.6;

    function findMatches(name){
      const plannedTokens = tokenize(name);
      if(!plannedTokens.length) return [];
      return boughtPool.filter(b => !b._used && matchScore(plannedTokens, tokenize(b.name)) >= MATCH_THRESHOLD);
    }

    let totalPlanned = 0, totalBought = 0, mismatches = 0;

    state.planned.forEach(p => {
      const plannedTotal = p.qty * p.price;
      totalPlanned += plannedTotal;
      const matches = findMatches(p.name);
      matches.forEach(m => { m._used = true; });

      const row = document.createElement('div');
      row.className = 'compare-row';

      let boughtColHtml, colClass = '';

      if(matches.length){
        const matchedQty = matches.reduce((s, m) => s + (m.qty || 1), 0);
        const matchedTotal = matches.reduce((s, m) => s + (m.qty || 1) * m.price, 0);
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
          <div class="matched-item">
            <span class="name">${escapeHtml(m.name)}</span>
            <span class="qty">x${m.qty || 1}</span>
            <span class="price">${fmtBRL(m.price)}</span>
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

    // extra items bought but not planned
    boughtPool.filter(b => !b._used).forEach(b => {
      const bQty = b.qty || 1;
      totalBought += bQty * b.price;
      const row = document.createElement('div');
      row.className = 'compare-row';
      row.innerHTML = `
        <div class="col-planned">
          <span class="name">—</span>
          <span class="meta"><span>não estava na lista</span></span>
        </div>
        <div class="col-bought diff-bad">
          <span class="name">${escapeHtml(b.name)}</span>
          <span class="meta"><span>x${bQty} · pago</span><span class="val">${fmtBRL(b.price)}</span></span>
          <span class="tag missing">item extra</span>
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
    state.planned.push({ name, qty, price });
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
    state.bought.push({ name, price });
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

  renderAll();
})();
