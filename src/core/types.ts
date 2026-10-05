import type { Measure } from './measure.js';

/** Previsto — o que você viu anunciado. Preço é sempre unitário. */
export interface PlannedItem {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  /**
   * `null` quando o preço só existe no caixa.
   *
   * Linguiça, fruta, carne: na gôndola você vê o produto e o preço do quilo,
   * mas o valor da sua compra sai da balança. Não é esquecimento nem erro —
   * é informação que ainda não existe, e que não pode ser cobrada como falta.
   */
  readonly unitPrice: number | null;
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

/**
 * Descontos atribuídos — quanto do Desconto do cupom você ligou a cada
 * Previsto, olhando o cupom de papel. Chave é o id do Previsto.
 *
 * É pelo Previsto, e não pela Linha do cupom, porque o veredito de "cobrado a
 * mais" é dele: mudar qual linha caiu no item não muda o desconto que ele teve.
 */
export type DiscountAllocations = Readonly<Record<string, number>>;

/** O Desconto do cupom e quanto dele já tem dono. */
export interface CouponDiscount {
  readonly total: number;
  readonly allocations: DiscountAllocations;
}

export const NO_DISCOUNT: CouponDiscount = { total: 0, allocations: {} };

/** Quanto custou o Previsto pelo preço anunciado, ou `null` se não havia preço. */
export function plannedTotal(planned: PlannedItem): number | null {
  return planned.unitPrice === null ? null : planned.quantity * planned.unitPrice;
}
