import { emptyState, normalizeState, type StoredState } from './schema.js';

const KEY = 'conferelista_v2';

/**
 * A chave antiga, de quando a Linha do cupom guardava `qty` + `price` +
 * `isWeight`. É lida quando não existe nada na chave nova, e nunca é apagada:
 * se a migração tiver algum defeito que só apareça no meio de uma compra, a
 * compra original continua lá.
 */
const LEGACY_KEY = 'conferelista_v1';

export function loadState(): StoredState {
  try {
    const current = localStorage.getItem(KEY);
    if (current) return normalizeState(JSON.parse(current));

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return normalizeState(JSON.parse(legacy));

    return emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state: StoredState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
