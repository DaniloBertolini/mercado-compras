import type { Measure } from './measure.js';

/** Previsto — o que você viu anunciado. Preço é sempre unitário. */
export interface PlannedItem {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

/** Linha do cupom — uma linha do cupom fiscal, que pode valer várias unidades. */
export interface ReceiptLine {
  readonly id: string;
  readonly name: string;
  readonly measure: Measure;
}

/**
 * Ajustes — decisões manuais de a qual Previsto cada Linha do cupom pertence.
 * Chave é o id da Linha; `null` significa "esta não estava na lista".
 */
export type Adjustments = Readonly<Record<string, string | null>>;

/** Quanto custou o Previsto pelo preço anunciado. */
export function plannedTotal(planned: PlannedItem): number {
  return planned.quantity * planned.unitPrice;
}
