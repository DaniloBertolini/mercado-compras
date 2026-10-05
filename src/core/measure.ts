/**
 * Medida — como uma Linha do cupom é quantificada.
 *
 * As duas formas não se misturam, e é por isso que são um tipo só com duas
 * caras: quando `quantidade` e `preço` eram campos soltos, nada impedia somar
 * 0,435 kg com 8 unidades, nem exibir o preço do quilo como se fosse o preço do
 * produto. Era exatamente o que fazia três bandejas de bife aparecerem como
 * "1,25 un" custando "R$ 54,90".
 */
export type Measure =
  | { readonly kind: 'units'; readonly count: number; readonly unitPrice: number }
  | { readonly kind: 'weight'; readonly kilos: number; readonly pricePerKilo: number };

/**
 * Quantas unidades esta Medida vale para efeito de contagem.
 *
 * Peso conta como uma: uma bandeja de bife é uma bandeja, tenha ela 0,376 kg ou
 * 0,439 kg. Sem isso, três bandejas somariam "1,25" contra uma quantidade
 * prevista de 3.
 */
export function units(measure: Measure): number {
  return measure.kind === 'weight' ? 1 : measure.count;
}

/** Quanto esta Medida custou no total. */
export function total(measure: Measure): number {
  return measure.kind === 'weight'
    ? measure.kilos * measure.pricePerKilo
    : measure.count * measure.unitPrice;
}
