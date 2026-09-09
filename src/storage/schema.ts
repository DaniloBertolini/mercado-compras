import { uid } from '../id.js';
import type { Measure } from '../core/measure.js';
import type { PlannedItem, ReceiptLine } from '../core/types.js';

export type Step = 1 | 2 | 3;

/** O estado inteiro do app — é isto que vai para o localStorage e para o Backup. */
export interface StoredState {
  step: Step;
  planned: PlannedItem[];
  lines: ReceiptLine[];
  /** id da Linha do cupom -> id do Previsto, ou null para Fora da lista */
  adjustments: Record<string, string | null>;
}

export function emptyState(): StoredState {
  return { step: 1, planned: [], lines: [], adjustments: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function readName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readId(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : uid();
}

/**
 * Medida a partir de qualquer formato já gravado.
 *
 * O formato antigo guardava `qty` + `price` + `isWeight`, onde `price` era o
 * preço do quilo quando `isWeight` era verdadeiro. Ele é aceito para sempre:
 * um Backup é um texto que pode ficar meses parado numa conversa de WhatsApp,
 * e recusá-lo seria perder a compra.
 */
function readMeasure(raw: Record<string, unknown>): Measure | null {
  const measure = raw['measure'];

  if (isRecord(measure)) {
    if (measure['kind'] === 'weight') {
      const kilos = toNumber(measure['kilos']);
      const pricePerKilo = toNumber(measure['pricePerKilo']);
      if (Number.isNaN(kilos) || Number.isNaN(pricePerKilo)) return null;
      return { kind: 'weight', kilos, pricePerKilo };
    }
    if (measure['kind'] === 'units') {
      const count = toNumber(measure['count']);
      const unitPrice = toNumber(measure['unitPrice']);
      if (Number.isNaN(count) || Number.isNaN(unitPrice)) return null;
      return { kind: 'units', count, unitPrice };
    }
    return null;
  }

  const price = toNumber(raw['price']);
  if (Number.isNaN(price)) return null;

  const qty = toNumber(raw['qty']);
  const quantity = !Number.isNaN(qty) && qty > 0 ? qty : 1;

  return raw['isWeight'] === true
    ? { kind: 'weight', kilos: quantity, pricePerKilo: price }
    : { kind: 'units', count: quantity, unitPrice: price };
}

function readPlanned(raw: unknown): PlannedItem | null {
  if (!isRecord(raw)) return null;

  const name = readName(raw['name']);
  if (!name) return null;

  const unitPrice = toNumber(raw['unitPrice'] ?? raw['price']);
  if (Number.isNaN(unitPrice)) return null;

  const quantity = toNumber(raw['quantity'] ?? raw['qty']);

  return {
    id: readId(raw['id']),
    name,
    quantity: !Number.isNaN(quantity) && quantity > 0 ? quantity : 1,
    unitPrice,
  };
}

function readLine(raw: unknown): ReceiptLine | null {
  if (!isRecord(raw)) return null;

  const name = readName(raw['name']);
  if (!name) return null;

  const measure = readMeasure(raw);
  if (!measure) return null;

  return { id: readId(raw['id']), name, measure };
}

function readStep(value: unknown): Step {
  const step = Number(value);
  return step === 2 || step === 3 ? step : 1;
}

/**
 * Transforma qualquer coisa num estado válido: o que está no localStorage, o
 * que veio de um Backup, ou lixo.
 *
 * Nunca confia na entrada. O texto pode ter sido truncado no caminho (WhatsApp,
 * e-mail), editado à mão, ou vir de uma versão antiga do app. Item que não dá
 * para entender é descartado — melhor perder uma linha do que exibir "R$ NaN"
 * no meio da conferência.
 */
export function normalizeState(raw: unknown): StoredState {
  if (!isRecord(raw)) return emptyState();

  const planned = (Array.isArray(raw['planned']) ? raw['planned'] : [])
    .map(readPlanned)
    .filter((item): item is PlannedItem => item !== null);

  const rawLines = Array.isArray(raw['lines'])
    ? raw['lines']
    : Array.isArray(raw['bought'])
      ? raw['bought']
      : [];

  const lines = rawLines.map(readLine).filter((line): line is ReceiptLine => line !== null);

  const rawAdjustments = isRecord(raw['adjustments'])
    ? raw['adjustments']
    : isRecord(raw['overrides'])
      ? raw['overrides']
      : {};

  // Ajuste que aponta para item apagado vira lixo silencioso, então some aqui.
  const plannedIds = new Set(planned.map((item) => item.id));
  const lineIds = new Set(lines.map((line) => line.id));
  const adjustments: Record<string, string | null> = {};

  for (const [lineId, target] of Object.entries(rawAdjustments)) {
    if (!lineIds.has(lineId)) continue;
    if (target === null) {
      adjustments[lineId] = null;
    } else if (typeof target === 'string' && plannedIds.has(target)) {
      adjustments[lineId] = target;
    }
  }

  return { step: readStep(raw['step']), planned, lines, adjustments };
}
