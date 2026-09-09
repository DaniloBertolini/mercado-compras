import './styles/steps.css';
import { byId, type Screen } from './dom.js';
import type { Store } from '../store.js';
import type { Step } from '../storage/schema.js';

/** Mostra a tela do passo atual e acende a etiqueta correspondente no topo. */
export function mountSteps(store: Store): Screen {
  const screens: Record<Step, HTMLElement> = {
    1: byId('screen-planned'),
    2: byId('screen-bought'),
    3: byId('screen-compare'),
  };
  const tags = document.querySelectorAll<HTMLElement>('[data-step-tag]');

  return {
    render() {
      const current = store.get().step;

      for (const [step, element] of Object.entries(screens)) {
        element.classList.toggle('active', Number(step) === current);
      }
      for (const tag of tags) {
        tag.classList.toggle('active', Number(tag.dataset['stepTag']) === current);
      }
    },
  };
}
