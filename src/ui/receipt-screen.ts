import './styles/receipt-import.css';
import { total as measureTotal } from '../core/measure.js';
import { parseReceiptText, type RawLine } from '../core/receipt.js';
import { uid } from '../id.js';
import type { Store } from '../store.js';
import { byId, type Screen } from './dom.js';
import { escapeHtml, measureLabel, money } from './format.js';

/** Linha bruta esperando você confirmar que ela entra na lista paga. */
interface PendingLine extends RawLine {
  checked: boolean;
}

/** Tela 2 — o que o caixa cobrou. */
export function mountReceiptScreen(store: Store): Screen {
  const listEl = byId<HTMLUListElement>('list-bought');
  const emptyEl = byId('empty-bought');
  const totalEl = byId('total-bought');
  const form = byId<HTMLFormElement>('form-bought');
  const btnFinish = byId<HTMLButtonElement>('btn-finish-bought');
  const btnBack = byId<HTMLButtonElement>('btn-back-planned');

  const nameEl = byId<HTMLInputElement>('b-name');
  const priceEl = byId<HTMLInputElement>('b-price');

  const linkEl = byId<HTMLInputElement>('import-link');
  const btnOpenLink = byId<HTMLButtonElement>('btn-open-link');
  const importTextEl = byId<HTMLTextAreaElement>('import-text');
  const btnParse = byId<HTMLButtonElement>('btn-parse-text');
  const previewListEl = byId<HTMLUListElement>('preview-list');
  const previewEmptyEl = byId('import-empty');
  const btnConfirm = byId<HTMLButtonElement>('btn-confirm-import');

  // Só existe entre colar o texto e confirmar: não vale a pena guardar.
  let pending: PendingLine[] = [];

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = nameEl.value.trim();
    const unitPrice = Number(priceEl.value);
    if (!name || Number.isNaN(unitPrice)) return;

    store.update((state) => {
      state.lines.push({ id: uid(), name, measure: { kind: 'units', count: 1, unitPrice } });
    });

    nameEl.value = '';
    priceEl.value = '';
    nameEl.focus();
  });

  listEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('.rm');
    if (!button) return;

    const index = Number(button.dataset['idx']);
    store.update((state) => {
      state.lines.splice(index, 1);
    });
  });

  btnBack.addEventListener('click', () => {
    store.update((state) => {
      state.step = 1;
    });
  });

  btnFinish.addEventListener('click', () => {
    if (store.get().lines.length === 0) return;
    store.update((state) => {
      state.step = 3;
    });
  });

  btnOpenLink.addEventListener('click', () => {
    const link = linkEl.value.trim();
    if (!link) return;
    window.open(link, '_blank', 'noopener');
  });

  btnParse.addEventListener('click', () => {
    pending = parseReceiptText(importTextEl.value).map((line) => ({ ...line, checked: true }));
    renderPreview();
  });

  previewListEl.addEventListener('change', (event) => {
    const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) return;

    const line = pending[Number(checkbox.dataset['idx'])];
    if (line) line.checked = checkbox.checked;
    btnConfirm.disabled = !pending.some((item) => item.checked);
  });

  btnConfirm.addEventListener('click', () => {
    const chosen = pending.filter((line) => line.checked);

    store.update((state) => {
      for (const line of chosen) {
        state.lines.push({ id: uid(), name: line.name, measure: line.measure });
      }
    });

    pending = [];
    importTextEl.value = '';
    renderPreview();
  });

  function renderPreview(): void {
    previewListEl.innerHTML = '';
    previewEmptyEl.style.display = pending.length ? 'none' : 'block';

    pending.forEach((line, index) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <label>
          <input type="checkbox" data-idx="${index}" ${line.checked ? 'checked' : ''}>
          <span class="name">${escapeHtml(line.name)} <span class="qty">${measureLabel(line.measure)}</span></span>
        </label>
        <span class="price">${money(line.displayTotal)}</span>
      `;
      previewListEl.appendChild(li);
    });

    btnConfirm.disabled = !pending.some((line) => line.checked);
  }

  return {
    render() {
      const { lines } = store.get();

      listEl.innerHTML = '';
      emptyEl.style.display = lines.length ? 'none' : 'block';

      let total = 0;
      lines.forEach((line, index) => {
        const lineTotal = measureTotal(line.measure);
        total += lineTotal;

        const li = document.createElement('li');
        li.innerHTML = `
          <span class="name">${escapeHtml(line.name)}</span>
          <span class="qty">${measureLabel(line.measure)}</span>
          <span class="price">${money(lineTotal)}</span>
          <button class="rm" data-idx="${index}" title="remover">×</button>
        `;
        listEl.appendChild(li);
      });

      totalEl.textContent = money(total);
      btnFinish.disabled = lines.length === 0;
    },
  };
}
