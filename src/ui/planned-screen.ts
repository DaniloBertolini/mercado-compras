import { plannedTotal } from '../core/types.js';
import { uid } from '../id.js';
import type { Store } from '../store.js';
import { byId, type Screen } from './dom.js';
import { escapeHtml, money } from './format.js';

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
    const button = (event.target as HTMLElement).closest<HTMLElement>('.rm');
    if (!button) return;

    const index = Number(button.dataset['idx']);
    store.update((state) => {
      state.planned.splice(index, 1);
    });
  });

  btnFinish.addEventListener('click', () => {
    if (store.get().planned.length === 0) return;
    store.update((state) => {
      state.step = 2;
    });
  });

  return {
    render() {
      const { planned } = store.get();

      listEl.innerHTML = '';
      emptyEl.style.display = planned.length ? 'none' : 'block';

      let total = 0;
      planned.forEach((item, index) => {
        total += plannedTotal(item);

        const li = document.createElement('li');
        li.innerHTML = `
          <span class="name">${escapeHtml(item.name)}</span>
          <span class="qty">x${item.quantity}</span>
          <span class="price">${money(item.unitPrice)}</span>
          <button class="rm" data-idx="${index}" title="remover">×</button>
        `;
        listEl.appendChild(li);
      });

      totalEl.textContent = money(total);
      btnFinish.disabled = planned.length === 0;
    },
  };
}
