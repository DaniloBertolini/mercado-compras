import { assignReceipt } from './core/assign.js';
import { total as measureTotal } from './core/measure.js';
import { parseReceiptText } from './core/receipt.js';
import { plannedTotal } from './core/types.js';
import { uid } from './id.js';
import { backupFileName, buildBackup, parseBackup } from './storage/backup.js';
import { loadState, saveState } from './storage/local.js';
import { emptyState } from './storage/schema.js';

(function(){
  "use strict";

  let state = loadState();

  function save(){
    saveState(state);
  }

  function fmtBRL(n){
    return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function measureLabel(measure){
    return measure.kind === 'weight'
      ? `${measure.kilos.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
      : `x${Math.round(measure.count)}`;
  }


  function applyBackup(imported){
    const hasData = state.planned.length || state.lines.length;
    const resumo = `${imported.planned.length} item(ns) planejado(s) e ${imported.lines.length} pago(s)`;
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
      total += plannedTotal(item);
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="qty">x${item.quantity}</span>
        <span class="price">${fmtBRL(item.unitPrice)}</span>
        <button class="rm" data-idx="${idx}" title="remover">×</button>
      `;
      listPlannedEl.appendChild(li);
    });
    totalPlannedEl.textContent = fmtBRL(total);
    btnFinishPlanned.disabled = state.planned.length === 0;
  }

  function renderBought(){
    listBoughtEl.innerHTML = '';
    emptyBoughtEl.style.display = state.lines.length ? 'none' : 'block';
    let total = 0;
    state.lines.forEach((item, idx) => {
      const lineTotal = measureTotal(item.measure);
      total += lineTotal;
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="qty">${measureLabel(item.measure)}</span>
        <span class="price">${fmtBRL(lineTotal)}</span>
        <button class="rm" data-idx="${idx}" title="remover">×</button>
      `;
      listBoughtEl.appendChild(li);
    });
    totalBoughtEl.textContent = fmtBRL(total);
    btnFinishBought.disabled = state.lines.length === 0;
  }

  function renderPreview(){
    previewListEl.innerHTML = '';
    importEmptyEl.style.display = previewItems.length ? 'none' : 'block';
    previewItems.forEach((item, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <label>
          <input type="checkbox" data-idx="${idx}" ${item.checked ? 'checked' : ''}>
          <span class="name">${escapeHtml(item.name)} <span class="qty">${measureLabel(item.measure)}</span></span>
        </label>
        <span class="price">${fmtBRL(item.displayTotal)}</span>
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
        ${escapeHtml(p.name)} · ${fmtBRL(p.unitPrice)}
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

    const { checks, unmatched } = assignReceipt(state.planned, state.lines, state.adjustments);

    compareListEl.classList.toggle('adjusting', adjusting);
    btnClearAdjust.style.display = Object.keys(state.adjustments).length ? '' : 'none';

    let totalPlanned = 0, totalBought = 0, mismatches = 0;

    checks.forEach(check => {
      const p = check.planned;
      const matches = check.matches;
      const previstoTotal = plannedTotal(p);
      totalPlanned += previstoTotal;

      const row = document.createElement('div');
      row.className = 'compare-row';

      let boughtColHtml, colClass = '';

      if(matches.length){
        const matchedQty = check.matchedUnits;
        const matchedTotal = matches.reduce((s, m) => s + measureTotal(m.line.measure), 0);
        totalBought += matchedTotal;
        const diff = matchedTotal - previstoTotal;

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

        const qtyNoteHtml = matchedQty !== p.quantity
          ? `<span class="tag missing">encontrado ${matchedQty}/${p.quantity} un.</span>`
          : '';

        const itemsHtml = matches.map(m => `
          <div class="matched-item${m.manual ? ' manual' : ''}">
            <span class="name">${escapeHtml(m.line.name)}</span>
            <span class="qty">${measureLabel(m.line.measure)}</span>
            <span class="price">${fmtBRL(measureTotal(m.line.measure))}</span>
            ${reassignHtml(m.line, p.id)}
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
          <span class="meta"><span>x${p.quantity} · anunciado</span><span class="val">${fmtBRL(previstoTotal)}</span></span>
        </div>
        <div class="col-bought ${colClass}">
          ${boughtColHtml}
        </div>
      `;
      compareListEl.appendChild(row);
    });

    // linhas do cupom que nenhum Previsto levou
    unmatched.forEach(u => {
      const lineTotal = measureTotal(u.line.measure);
      totalBought += lineTotal;

      // Excedente: alguém reconheceu a linha como sua, mas já tinha completado a
      // quantidade prevista. Bem diferente de uma compra fora da lista.
      const surplusOf = u.surplusOf;
      const plannedColHtml = surplusOf
        ? `<span class="name">${escapeHtml(surplusOf.name)}</span>
           <span class="meta"><span>x${surplusOf.quantity} já encontrados</span></span>`
        : `<span class="name">—</span>
           <span class="meta"><span>não estava na lista</span></span>`;
      const tagHtml = surplusOf
        ? `<span class="tag bad">além do planejado</span>`
        : `<span class="tag missing">item extra</span>`;

      const row = document.createElement('div');
      row.className = 'compare-row';
      row.innerHTML = `
        <div class="col-planned">
          ${plannedColHtml}
        </div>
        <div class="col-bought diff-bad${u.manual ? ' manual' : ''}">
          <span class="name">${escapeHtml(u.line.name)}</span>
          <span class="meta"><span>${measureLabel(u.line.measure)} · pago</span><span class="val">${fmtBRL(lineTotal)}</span></span>
          ${tagHtml}
          ${reassignHtml(u.line, null)}
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
    state.planned.push({ id: uid(), name, quantity: qty, unitPrice: price });
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
    state.lines.push({ id: uid(), name, measure: { kind: 'units', count: 1, unitPrice: price } });
    save();
    renderBought();
    nameEl.value = ''; priceEl.value = '';
    nameEl.focus();
  });

  listBoughtEl.addEventListener('click', e => {
    const btn = e.target.closest('.rm');
    if(!btn) return;
    state.lines.splice(Number(btn.dataset.idx), 1);
    save();
    renderBought();
  });

  btnBackPlanned.addEventListener('click', () => {
    state.step = 1;
    save();
    renderAll();
  });

  btnFinishBought.addEventListener('click', () => {
    if(state.lines.length === 0) return;
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
    state = emptyState();
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
    state.adjustments = {};
    save();
    renderCompare();
  });

  compareListEl.addEventListener('change', e => {
    const sel = e.target.closest('select.reassign');
    if(!sel) return;
    state.adjustments[sel.dataset.boughtId] = sel.value === '' ? null : sel.value;
    save();
    renderCompare();
  });

  btnOpenLink.addEventListener('click', () => {
    const link = importLinkEl.value.trim();
    if(!link) return;
    window.open(link, '_blank', 'noopener');
  });

  btnParseText.addEventListener('click', () => {
    const parsed = parseReceiptText(importTextEl.value);
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
      state.lines.push({ id: uid(), name: i.name, measure: i.measure });
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
    const text = buildBackup(state);
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
    const blob = new Blob([buildBackup(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    URL.revokeObjectURL(url);
    backupStatus('Arquivo gerado — mande para o outro aparelho e use "abrir arquivo".', 'ok');
  });

  btnImportText.addEventListener('click', () => {
    try{
      if(applyBackup(parseBackup(backupTextEl.value))){
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
        if(applyBackup(parseBackup(reader.result))){
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
