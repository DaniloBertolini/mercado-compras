import { plannedTotal, type PlannedItem } from '../core/types.js';
import { uid } from '../id.js';
import type { Store } from '../store.js';
import { byId, type Screen } from './dom.js';
import { escapeAttr, escapeHtml, money } from './format.js';

/** Tela 1 — o que você viu anunciado na gôndola. */
export function mountPlannedScreen(store: Store): Screen {
  const listEl = byId<HTMLUListElement>('list-planned');
  const emptyEl = byId('empty-planned');
  const totalEl = byId('total-planned');
  const form = byId<HTMLFormElement>('form-planned');
  const btnFinish = byId<HTMLButtonElement>('btn-finish-planned');

  const nameEl = byId<HTMLInputElement>('p-name');
  const qtyEl = byId<HTMLInputElement>('p-qty');
  const priceEl = byId<HTMLInputElement>('p-price');
  const atCheckoutEl = byId<HTMLInputElement>('p-at-checkout');

  // Marcado, o campo de preço não tem o que receber: linguiça e fruta só ganham
  // valor na balança. Desabilitar deixa isso explícito em vez de aceitar um
  // número que seria inventado.
  atCheckoutEl.addEventListener('change', () => {
    priceEl.disabled = atCheckoutEl.checked;
    priceEl.required = !atCheckoutEl.checked;
    if (atCheckoutEl.checked) priceEl.value = '';
  });

  /**
   * Qual item está aberto para edição. Só visual, e só um por vez: não vai para
   * o localStorage porque abrir a lista já editando não faria sentido.
   */
  let editingId: string | null = null;

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = nameEl.value.trim();
    if (!name) return;

    const atCheckout = atCheckoutEl.checked;
    const unitPrice = atCheckout ? null : Number(priceEl.value);
    if (unitPrice !== null && Number.isNaN(unitPrice)) return;

    const quantity = Number(qtyEl.value) || 1;
    store.update((state) => {
      state.planned.push({ id: uid(), name, quantity, unitPrice });
    });

    nameEl.value = '';
    qtyEl.value = '1';
    priceEl.value = '';
    // a marcação continua ligada: na seção de hortifruti você adiciona vários
    // seguidos, e desmarcar a cada item seria um toque a mais por produto
    nameEl.focus();
  });

  listEl.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const remove = target.closest<HTMLElement>('.rm');
    if (remove) {
      const id = remove.dataset['id'];
      if (editingId === id) editingId = null;
      store.update((state) => {
        state.planned = state.planned.filter((item) => item.id !== id);
      });
      return;
    }

    const edit = target.closest<HTMLElement>('.edit');
    if (edit) {
      editingId = edit.dataset['id'] ?? null;
      render();
      // o campo do nome já aberto poupa um toque, que de pé no mercado conta
      listEl.querySelector<HTMLInputElement>('.edit-name')?.focus();
      return;
    }

    if (target.closest('.cancel-edit')) {
      editingId = null;
      render();
    }
  });

  // o checkbox vive fora do <form>, então a troca é tratada aqui
  listEl.addEventListener('change', (event) => {
    const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>('.edit-at-checkout');
    if (!checkbox) return;

    const priceInput = checkbox.closest('li')?.querySelector<HTMLInputElement>('.edit-price');
    if (!priceInput) return;

    priceInput.disabled = checkbox.checked;
    priceInput.required = !checkbox.checked;
    if (checkbox.checked) priceInput.value = '';
  });

  listEl.addEventListener('submit', (event) => {
    event.preventDefault();

    const editForm = (event.target as HTMLElement).closest<HTMLFormElement>('.edit-form');
    if (!editForm) return;

    const item = editForm.closest('li');
    const id = editForm.dataset['id'];
    const name = editForm.querySelector<HTMLInputElement>('.edit-name')?.value.trim() ?? '';
    const quantity = Number(editForm.querySelector<HTMLInputElement>('.edit-qty')?.value) || 1;

    const atCheckout = item?.querySelector<HTMLInputElement>('.edit-at-checkout')?.checked ?? false;
    const unitPrice = atCheckout
      ? null
      : Number(editForm.querySelector<HTMLInputElement>('.edit-price')?.value);

    if (!name || (unitPrice !== null && Number.isNaN(unitPrice))) return; // deixa aberto para corrigir

    editingId = null;
    store.update((state) => {
      state.planned = state.planned.map((item) =>
        item.id === id ? { id: item.id, name, quantity, unitPrice } : item,
      );
    });
  });

  btnFinish.addEventListener('click', () => {
    if (store.get().planned.length === 0) return;
    editingId = null;
    store.update((state) => {
      state.step = 2;
    });
  });

  function itemHtml(item: PlannedItem): string {
    const priceHtml =
      item.unitPrice === null
        ? '<span class="price at-checkout-tag">no caixa</span>'
        : `<span class="price">${money(item.unitPrice)}</span>`;

    return `
      <span class="name">${escapeHtml(item.name)}</span>
      <span class="qty">x${item.quantity}</span>
      ${priceHtml}
      <button class="edit" data-id="${item.id}" title="editar">✎</button>
      <button class="rm" data-id="${item.id}" title="remover">×</button>
    `;
  }

  /** Reusa o mesmo grid do formulário de cima, que já é feito para o dedo. */
  function editHtml(item: PlannedItem): string {
    return `
      <form class="entry edit-form" data-id="${item.id}">
        <div>
          <label class="field-label">Produto</label>
          <input type="text" class="edit-name" value="${escapeAttr(item.name)}" autocomplete="off" required>
        </div>
        <div>
          <label class="field-label">Qtd</label>
          <input type="number" class="edit-qty" min="1" value="${item.quantity}" required>
        </div>
        <div>
          <label class="field-label">Preço R$</label>
          <input type="number" class="edit-price" min="0" step="0.01"
                 value="${item.unitPrice ?? ''}" ${item.unitPrice === null ? 'disabled' : 'required'}>
        </div>
        <button type="submit" class="btn-add" title="salvar">✓</button>
      </form>
      <label class="at-checkout">
        <input type="checkbox" class="edit-at-checkout" ${item.unitPrice === null ? 'checked' : ''}>
        só sei o preço no caixa
      </label>
      <button type="button" class="cancel-edit">cancelar</button>
    `;
  }

  function render(): void {
    const { planned } = store.get();

    listEl.innerHTML = '';
    emptyEl.style.display = planned.length ? 'none' : 'block';

    let total = 0;
    let atCheckout = 0;

    for (const item of planned) {
      const itemTotal = plannedTotal(item);
      if (itemTotal === null) atCheckout += 1;
      else total += itemTotal;

      const li = document.createElement('li');
      const editing = item.id === editingId;
      li.className = editing ? 'editing' : '';
      li.innerHTML = editing ? editHtml(item) : itemHtml(item);
      listEl.appendChild(li);
    }

    // Avisar que o total está incompleto é melhor que mostrar um número que
    // parece fechado e não é: os itens de peso ainda vão somar no caixa.
    totalEl.textContent =
      atCheckout > 0 ? `${money(total)} + ${atCheckout} no caixa` : money(total);

    btnFinish.disabled = planned.length === 0;
  }

  return { render };
}
