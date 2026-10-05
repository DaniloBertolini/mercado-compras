import './styles/compare.css';
import { assignReceipt } from '../core/assign.js';
import { total as measureTotal } from '../core/measure.js';
import {
  CENT_TOLERANCE,
  reviewAssignment,
  type CheckRow,
  type ReviewRow,
  type Severity,
  type UnmatchedRow,
} from '../core/review.js';
import type { ReceiptLine } from '../core/types.js';
import { emptyState } from '../storage/schema.js';
import type { Store } from '../store.js';
import { byId, type Screen } from './dom.js';
import { escapeHtml, measureLabel, money } from './format.js';

/**
 * O título de cada grupo. A ordem é decidida no núcleo (SEVERITY_ORDER); aqui
 * só se dá nome ao que ele já ordenou.
 */
const GROUP_TITLE: Record<Severity, string> = {
  overpaid: 'cobrado a mais',
  missing: 'faltando no cupom',
  extra: 'além da lista',
  unpriced: 'preço só no caixa',
  settled: 'conferido, sem problema',
};

/** Tela 3 — anunciado contra cobrado. */
export function mountCompareScreen(store: Store): Screen {
  const listEl = byId('compare-list');
  const summaryEl = byId('summary');
  const btnBack = byId<HTMLButtonElement>('btn-back-bought');
  const btnReset = byId<HTMLButtonElement>('btn-reset');
  const btnToggleAdjust = byId<HTMLButtonElement>('btn-toggle-adjust');
  const btnClearAdjust = byId<HTMLButtonElement>('btn-clear-adjust');
  const discountBarEl = byId('discount-bar');

  // Estado só visual: cada visita à tela começa lendo, não editando. Por isso
  // não vai para o localStorage.
  let adjusting = false;

  /**
   * Saldo do Desconto do cupom no último desenho. O formulário de cada item
   * precisa dele para não gravar mais do que sobrou — o núcleo já limita a
   * conta, mas gravar o valor limitado faz a tela mostrar o que vale de fato.
   */
  let unallocated = 0;

  /**
   * Grupos que você recolheu. Vive só enquanto a tela está aberta, mas precisa
   * existir: a lista é redesenhada inteira a cada ajuste, e sem isso o grupo
   * que você acabou de fechar reabriria sozinho.
   */
  const collapsed = new Set<Severity>();

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

  listEl.addEventListener('submit', (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('form.discount-form');
    if (!form) return;
    event.preventDefault();

    const plannedId = form.dataset['plannedId'];
    const amount = Number(form.querySelector<HTMLInputElement>('input')?.value);
    if (!plannedId || !Number.isFinite(amount) || amount <= 0) return;

    const capped = Math.round(Math.min(amount, unallocated) * 100) / 100;
    if (capped <= 0) return;

    store.update((state) => {
      state.discountAllocations[plannedId] = capped;
    });
  });

  listEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('.undo-discount');
    const plannedId = button?.dataset['plannedId'];
    if (!plannedId) return;

    store.update((state) => {
      delete state.discountAllocations[plannedId];
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
            ${escapeHtml(item.name)} · ${item.unitPrice === null ? 'no caixa' : money(item.unitPrice)}
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

  /**
   * A coluna do anunciado espelha a do cupom: primeiro o preço de cada unidade,
   * depois o total. Sem o unitário não dá para comparar preço com preço — o
   * cupom mostra "R$ 4,59 cada" e o anunciado mostrava só o total de oito.
   */
  function plannedColHtml(row: CheckRow): string {
    const previsto = row.check.planned;

    if (previsto.unitPrice === null || row.announced === null) {
      return `
        <span class="name">${escapeHtml(previsto.name)}</span>
        <span class="meta"><span>preço só no caixa</span></span>
      `;
    }

    const unitLine =
      previsto.quantity > 1
        ? `<span class="meta"><span>x${previsto.quantity} · ${money(previsto.unitPrice)} cada</span></span>`
        : '';

    return `
      <span class="name">${escapeHtml(previsto.name)}</span>
      ${unitLine}
      <span class="meta"><span>total anunciado</span><span class="val">${money(row.announced)}</span></span>
    `;
  }

  /**
   * "Foi desconto do caixa" num item cobrado a mais. O valor já vem com a
   * diferença inteira, que é o caso comum: um toque resolve. Quando o cupom de
   * papel mostra um desconto menor, você troca o número e o item continua
   * vermelho só com o que foi cobrado a mais de verdade.
   */
  function discountFormHtml(row: CheckRow): string {
    if (row.diff === null || row.diff <= CENT_TOLERANCE) return '';
    if (row.discounted > 0 || unallocated <= CENT_TOLERANCE) return '';

    const suggested = Math.min(row.diff, unallocated);

    return `
      <form class="discount-form" data-planned-id="${row.check.planned.id}">
        <input type="number" value="${suggested.toFixed(2)}" min="0.01" step="0.01" inputmode="decimal"
               aria-label="valor do desconto no cupom de papel">
        <button type="submit">foi desconto do caixa</button>
      </form>
    `;
  }

  function checkRowHtml(row: CheckRow): string {
    const { check, paid, diff } = row;
    const previsto = check.planned;

    if (check.matches.length === 0) {
      return `
        <div class="col-planned">
          ${plannedColHtml(row)}
        </div>
        <div class="col-bought">
          <span class="name">—</span>
          <span class="meta"><span>não encontrado no cupom</span></span>
          <span class="tag missing">sem correspondência</span>
        </div>
      `;
    }

    let colClass: string;
    let tagHtml: string;

    // Com várias unidades, saber que são 20 centavos em cada muda a decisão de
    // reclamar mais do que saber que o total deu R$ 1,60.
    const unitNote =
      row.unitDiff === null ? '' : ` · ${money(Math.abs(row.unitDiff))} em cada`;

    if (diff === null) {
      // sem preço anunciado não há veredito possível: mostra o que foi pago
      colClass = '';
      tagHtml = '<span class="tag missing">sem preço para conferir</span>';
    }
    // Mesma tolerância que o núcleo usa para agrupar, senão uma diferença de
    // meio centavo cairia em "conferido" exibindo "+R$ 0,00 a mais".
    else if (Math.abs(diff) < CENT_TOLERANCE) {
      colClass = 'diff-ok';
      tagHtml = '<span class="tag ok">preço correto</span>';
    } else if (diff > 0) {
      colClass = 'diff-bad';
      tagHtml = `<span class="tag bad">+${money(diff)} a mais${unitNote}</span>`;
    } else {
      colClass = 'diff-ok';
      tagHtml = `<span class="tag ok">${money(Math.abs(diff))} a menos${unitNote}</span>`;
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

    // As linhas acima ficam com o preço cheio do portal; o desconto aparece
    // entre elas e o total, como no cupom de papel.
    const discountHtml =
      row.discounted > 0
        ? `<span class="meta discount-line">
             <span>desconto no caixa
               <button type="button" class="undo-discount" data-planned-id="${previsto.id}" aria-label="desfazer o desconto deste item">desfazer</button>
             </span>
             <span>−${money(row.discounted)}</span>
           </span>`
        : '';

    return `
      <div class="col-planned">
        ${plannedColHtml(row)}
      </div>
      <div class="col-bought ${colClass}">
        ${itemsHtml}
        ${discountHtml}
        <span class="meta"><span>total pago</span><span class="val">${money(paid - row.discounted)}</span></span>
        ${tagHtml}
        ${qtyNoteHtml}
        ${discountFormHtml(row)}
      </div>
    `;
  }

  function unmatchedRowHtml(row: UnmatchedRow): string {
    const entry = row.entry;
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
        <span class="meta"><span>${measureLabel(entry.line.measure)} · pago</span><span class="val">${money(row.paid)}</span></span>
        ${tagHtml}
        ${reassignHtml(entry.line, null)}
      </div>
    `;
  }

  function rowHtml(row: ReviewRow): string {
    return row.kind === 'check' ? checkRowHtml(row) : unmatchedRowHtml(row);
  }

  /**
   * Cada grupo é um `<details>`: tocar no título recolhe a lista. Usar o
   * elemento nativo em vez de um botão com classe dá teclado e leitor de tela
   * de graça, e o título continua visível fechado — com a contagem, que é o que
   * você quer ver de relance.
   */
  function appendGroup(severity: Severity, rowsHtml: readonly string[]): void {
    const group = document.createElement('details');
    group.className = 'group';
    group.open = !collapsed.has(severity);

    group.addEventListener('toggle', () => {
      if (group.open) collapsed.delete(severity);
      else collapsed.add(severity);
    });

    const head = document.createElement('summary');
    head.className = `group-head ${severity}`;
    head.innerHTML = `
      <span class="arrow" aria-hidden="true"></span>
      <span class="group-name">${GROUP_TITLE[severity]}</span>
      <span class="count">${rowsHtml.length}</span>
    `;
    group.appendChild(head);

    for (const html of rowsHtml) {
      const row = document.createElement('div');
      row.className = 'compare-row';
      row.innerHTML = html;
      group.appendChild(row);
    }

    listEl.appendChild(group);
  }

  function render(): void {
    const state = store.get();
    const review = reviewAssignment(assignReceipt(state.planned, state.lines, state.adjustments), {
      total: state.discount,
      allocations: state.discountAllocations,
    });
    const { groups, announced, paid, discount, unpricedPaid, comparableDiff, divergingCount } = review;

    // antes de desenhar as linhas: é o saldo que decide quem ganha o formulário
    unallocated = review.unallocatedDiscount;

    discountBarEl.hidden = discount <= 0;
    discountBarEl.innerHTML = `
      desconto do cupom <strong>${money(discount)}</strong>
      · ${unallocated > CENT_TOLERANCE ? `a distribuir <strong>${money(unallocated)}</strong>` : 'todo distribuído'}
    `;

    listEl.innerHTML = '';
    listEl.classList.toggle('adjusting', adjusting);
    btnClearAdjust.style.display = Object.keys(state.adjustments).length ? '' : 'none';

    for (const group of groups) {
      appendGroup(group.severity, group.rows.map(rowHtml));
    }

    const diff = comparableDiff;

    // Só aparece quando existe: numa compra sem peso, a linha seria ruído.
    const unpricedRow =
      unpricedPaid > 0
        ? `<div class="summary-row faint">
             <span>sem preço anunciado · fora da conta</span><span>${money(unpricedPaid)}</span>
           </div>`
        : '';

    // O total pago já vem com ele abatido; a linha diz de onde saiu a diferença
    // para a soma dos itens acima, que continuam com o preço cheio.
    const discountRow =
      discount > 0
        ? `<div class="summary-row faint">
             <span>desconto do cupom · já abatido</span><span>−${money(discount)}</span>
           </div>`
        : '';

    summaryEl.innerHTML = `
      <div class="summary-row"><span>total anunciado</span><span>${money(announced)}</span></div>
      <div class="summary-row"><span>total pago</span><span>${money(paid)}</span></div>
      ${discountRow}
      ${unpricedRow}
      <div class="summary-row"><span>itens com preço divergente</span><span>${divergingCount}</span></div>
      <div class="summary-row highlight">
        <span>${diff > 0 ? 'você pagou a mais' : diff < 0 ? 'você pagou a menos' : 'tudo bateu certinho'}</span>
        <span class="amt ${diff > 0 ? 'bad' : 'ok'}">${money(Math.abs(diff))}</span>
      </div>
    `;
  }

  return { render };
}
