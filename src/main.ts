import './style.css';

import { loadState } from './storage/local.js';
import { createStore } from './store.js';
import { mountBackupPanel } from './ui/backup-panel.js';
import { mountCompareScreen } from './ui/compare-screen.js';
import { mountPlannedScreen } from './ui/planned-screen.js';
import { mountReceiptScreen } from './ui/receipt-screen.js';
import { mountSteps } from './ui/steps.js';

const store = createStore(loadState());

const steps = mountSteps(store);
const planned = mountPlannedScreen(store);
const receipt = mountReceiptScreen(store);
const compare = mountCompareScreen(store);
mountBackupPanel(store);

function render(): void {
  steps.render();
  planned.render();
  receipt.render();

  // O comparativo redistribui as linhas do cupom a cada desenho, então só roda
  // quando está à vista.
  if (store.get().step === 3) compare.render();
}

store.subscribe(render);
render();
