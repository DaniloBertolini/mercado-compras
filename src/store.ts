import { saveState } from './storage/local.js';
import type { StoredState } from './storage/schema.js';

/**
 * O estado do app e quem avisa a tela que ele mudou.
 *
 * Existe para que nenhuma tela precise lembrar de gravar: toda alteração passa
 * por `update`, que salva e redesenha. Antes isso era um `save(); renderX()`
 * repetido à mão em cada handler, e esquecer um dos dois era invisível até a
 * próxima vez que o app fosse aberto.
 */
export interface Store {
  get(): StoredState;
  /** Altera, grava e redesenha. */
  update(mutate: (state: StoredState) => void): void;
  /** Troca o estado inteiro — é o que a importação de Backup faz. */
  replace(next: StoredState): void;
  subscribe(listener: () => void): void;
}

export function createStore(initial: StoredState): Store {
  let state = initial;
  const listeners: (() => void)[] = [];

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    get: () => state,

    update(mutate) {
      mutate(state);
      saveState(state);
      notify();
    },

    replace(next) {
      state = next;
      saveState(state);
      notify();
    },

    subscribe(listener) {
      listeners.push(listener);
    },
  };
}
