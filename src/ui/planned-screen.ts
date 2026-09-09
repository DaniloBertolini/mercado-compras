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

  /**
   * Qual item está aberto para edição. Só visual, e só um por vez: não vai para
   * o localStorage porque abrir a lista já editando não faria sentido.
   */
  let editingId: string | null = null;

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = nameEl.value.trim();
    const unitPrice = Number(priceEl.value);
    if (!name || Number.isNaN(unitPrice)) return;

    const quantity = Number(qtyEl.value) || 1;
    store.update((state) => {
      state.planned.push({ id: uid(), name, quantity, unitPrice });
    });

    nameEl.value = '';
    qtyEl.value = '1';
    priceEl.value = '';
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

  listEl.addEventListener('submit', (event) => {
    event.preventDefault();

    const editForm = (event.target as HTMLElement).closest<HTMLFormElement>('.edit-form');
    if (!editForm) return;

    const id = editForm.dataset['id'];
    const name = editForm.querySelector<HTMLInputElement>('.edit-name')?.value.trim() ?? '';
    const unitPrice = Number(editForm.querySelector<HTMLInputElement>('.edit-price')?.value);
    const quantity = Number(editForm.querySelector<HTMLInputElement>('.edit-qty')?.value) || 1;

    if (!name || Number.isNaN(unitPrice)) return; // deixa aberto para corrigir

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
    return `
      <span class="name">${escapeHtml(item.name)}</span>
      <span class="qty">x${item.quantity}</span>
      <span class="price">${money(item.unitPrice)}</span>
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
          <input type="number" class="edit-price" min="0" step="0.01" value="${item.unitPrice}" required>
        </div>
        <button type="submit" class="btn-add" title="salvar">✓</button>
      </form>
      <button type="button" class="cancel-edit">cancelar</button>
    `;
  }

  function render(): void {
    const { planned } = store.get();

    listEl.innerHTML = '';
    emptyEl.style.display = planned.length ? 'none' : 'block';

    let total = 0;
    for (const item of planned) {
      total += plannedTotal(item);

      const li = document.createElement('li');
      const editing = item.id === editingId;
      li.className = editing ? 'editing' : '';
      li.innerHTML = editing ? editHtml(item) : itemHtml(item);
      listEl.appendChild(li);
    }

    totalEl.textContent = money(total);
    btnFinish.disabled = planned.length === 0;
  }

  return { render };
}
