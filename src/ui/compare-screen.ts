import { assignReceipt, type Check, type Unmatched } from '../core/assign.js';
import { total as measureTotal } from '../core/measure.js';
import { plannedTotal, type ReceiptLine } from '../core/types.js';
import { emptyState } from '../storage/schema.js';
import type { Store } from '../store.js';
import { byId, type Screen } from './dom.js';
import { escapeHtml, measureLabel, money } from './format.js';

/** Abaixo disso, a diferença é arredondamento de centavo, não cobrança errada. */
const CENT_TOLERANCE = 0.005;

/** Tela 3 — anunciado contra cobrado. */
export function mountCompareScreen(store: Store): Screen {
  const listEl = byId('compare-list');
  const summaryEl = byId('summary');
  const btnBack = byId<HTMLButtonElement>('btn-back-bought');
  const btnReset = byId<HTMLButtonElement>('btn-reset');
  const btnToggleAdjust = byId<HTMLButtonElement>('btn-toggle-adjust');
  const btnClearAdjust = byId<HTMLButtonElement>('btn-clear-adjust');

  // Estado só visual: cada visita à tela começa lendo, não editando. Por isso
  // não vai para o localStorage.
  let adjusting = false;

  btnBack.addEventListener('click', () => {
    store.update((state) => {
      state.step = 2;
    });
  });

  btnReset.addEventListener('click', () => {
    if (!confirm('Resetar tudo para a próxima compra?')) return;
    store.replace(emptyState());
  });

  btnToggleAdjust.addEventListener('click', () => {
    adjusting = !adjusting;
    btnToggleAdjust.classList.toggle('on', adjusting);
    btnToggleAdjust.textContent = adjusting ? '✓ terminei de ajustar' : '⇄ ajustar correspondências';
    render();
  });

  btnClearAdjust.addEventListener('click', () => {
    if (!confirm('Desfazer todos os ajustes manuais e voltar ao automático?')) return;
    store.update((state) => {
      state.adjustments = {};
    });
  });

  listEl.addEventListener('change', (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select.reassign');
    if (!select) return;

    const lineId = select.dataset['lineId'];
    if (!lineId) return;

    store.update((state) => {
      state.adjustments[lineId] = select.value === '' ? null : select.value;
    });
  });

  /**
   * Seletor de destino de cada Linha do cupom. É um <select> e não um arrastar
   * porque o uso é no celular, de pé, com uma mão: o seletor nativo abre em
   * tela cheia e não briga com a rolagem da página.
   */
  function reassignHtml(line: ReceiptLine, currentPlannedId: string | null): string {
    const options = store
      .get()
      .planned.map(
        (item) => `
          <option value="${item.id}"${item.id === currentPlannedId ? ' selected' : ''}>
            ${escapeHtml(item.name)} · ${money(item.unitPrice)}
          </option>
        `,
      )
      .join('');

    return `
      <select class="reassign" data-line-id="${line.id}" aria-label="mudar a que item previsto esta linha pertence">
        ${options}
        <option value=""${currentPlannedId === null ? ' selected' : ''}>— não estava na lista</option>
      </select>
    `;
  }

  function checkRow(check: Check): { html: string; paid: number; diverged: boolean } {
    const previsto = check.planned;
    const previstoTotal = plannedTotal(previsto);

    if (check.matches.length === 0) {
      return {
        html: `
          <div class="col-planned">
            <span class="name">${escapeHtml(previsto.name)}</span>
            <span class="meta"><span>x${previsto.quantity} · anunciado</span><span class="val">${money(previstoTotal)}</span></span>
          </div>
          <div class="col-bought ">
            <span class="name">—</span>
            <span class="meta"><span>não encontrado no cupom</span></span>
            <span class="tag missing">sem correspondência</span>
          </div>
        `,
        paid: 0,
        diverged: true,
      };
    }

    const paid = check.matches.reduce((sum, match) => sum + measureTotal(match.line.measure), 0);
    const diff = paid - previstoTotal;

    let colClass: string;
    let tagHtml: string;
    let diverged = false;

    if (Math.abs(diff) < CENT_TOLERANCE) {
      colClass = 'diff-ok';
      tagHtml = '<span class="tag ok">preço correto</span>';
    } else if (diff > 0) {
      colClass = 'diff-bad';
      diverged = true;
      tagHtml = `<span class="tag bad">+${money(diff)} a mais</span>`;
    } else {
      colClass = 'diff-ok';
      tagHtml = `<span class="tag ok">${money(Math.abs(diff))} a menos</span>`;
    }

    const qtyNoteHtml =
      check.matchedUnits !== previsto.quantity
        ? `<span class="tag missing">encontrado ${check.matchedUnits}/${previsto.quantity} un.</span>`
        : '';

    const itemsHtml = check.matches
      .map(
        (match) => `
          <div class="matched-item${match.manual ? ' manual' : ''}">
            <span class="name">${escapeHtml(match.line.name)}</span>
            <span class="qty">${measureLabel(match.line.measure)}</span>
            <span class="price">${money(measureTotal(match.line.measure))}</span>
            ${reassignHtml(match.line, previsto.id)}
          </div>
        `,
      )
      .join('');

    return {
      html: `
        <div class="col-planned">
          <span class="name">${escapeHtml(previsto.name)}</span>
          <span class="meta"><span>x${previsto.quantity} · anunciado</span><span class="val">${money(previstoTotal)}</span></span>
        </div>
        <div class="col-bought ${colClass}">
          ${itemsHtml}
          <span class="meta"><span>total pago</span><span class="val">${money(paid)}</span></span>
          ${tagHtml}
          ${qtyNoteHtml}
        </div>
      `,
      paid,
      diverged,
    };
  }

  function unmatchedRow(entry: Unmatched): string {
    const surplusOf = entry.surplusOf;

    // Excedente é diferente de compra fora da lista: alguém reconheceu a linha
    // como sua, mas já tinha completado a quantidade prevista.
    const plannedColHtml = surplusOf
      ? `<span class="name">${escapeHtml(surplusOf.name)}</span>
         <span class="meta"><span>x${surplusOf.quantity} já encontrados</span></span>`
      : `<span class="name">—</span>
         <span class="meta"><span>não estava na lista</span></span>`;

    const tagHtml = surplusOf
      ? '<span class="tag bad">além do planejado</span>'
      : '<span class="tag missing">item extra</span>';

    return `
      <div class="col-planned">
        ${plannedColHtml}
      </div>
      <div class="col-bought diff-bad${entry.manual ? ' manual' : ''}">
        <span class="name">${escapeHtml(entry.line.name)}</span>
        <span class="meta"><span>${measureLabel(entry.line.measure)} · pago</span><span class="val">${money(measureTotal(entry.line.measure))}</span></span>
        ${tagHtml}
        ${reassignHtml(entry.line, null)}
      </div>
    `;
  }

  function appendRow(html: string): void {
    const row = document.createElement('div');
    row.className = 'compare-row';
    row.innerHTML = html;
    listEl.appendChild(row);
  }

  function render(): void {
    const state = store.get();
    const { checks, unmatched } = assignReceipt(state.planned, state.lines, state.adjustments);

    listEl.innerHTML = '';
    listEl.classList.toggle('adjusting', adjusting);
    btnClearAdjust.style.display = Object.keys(state.adjustments).length ? '' : 'none';

    let announced = 0;
    let paid = 0;
    let diverging = 0;

    for (const check of checks) {
      const row = checkRow(check);
      announced += plannedTotal(check.planned);
      paid += row.paid;
      if (row.diverged) diverging += 1;
      appendRow(row.html);
    }

    for (const entry of unmatched) {
      paid += measureTotal(entry.line.measure);
      appendRow(unmatchedRow(entry));
    }

    const diff = paid - announced;
    summaryEl.innerHTML = `
      <div class="summary-row"><span>total anunciado</span><span>${money(announced)}</span></div>
      <div class="summary-row"><span>total pago</span><span>${money(paid)}</span></div>
      <div class="summary-row"><span>itens com preço divergente</span><span>${diverging}</span></div>
      <div class="summary-row highlight">
        <span>${diff > 0 ? 'você pagou a mais' : diff < 0 ? 'você pagou a menos' : 'tudo bateu certinho'}</span>
        <span class="amt ${diff > 0 ? 'bad' : 'ok'}">${money(Math.abs(diff))}</span>
      </div>
    `;
  }

  return { render };
}
