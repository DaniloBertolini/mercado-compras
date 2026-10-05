import type { Assignment, Check, Unmatched } from './assign.js';
import { total as measureTotal } from './measure.js';
import { NO_DISCOUNT, plannedTotal, type CouponDiscount } from './types.js';

/**
 * Organiza a conferência na ordem em que ela é útil de ler.
 *
 * A tela de comparação responde a uma pergunta só — "onde me cobraram
 * errado?" — e a ordem em que a lista foi digitada não ajuda nisso: espalha os
 * problemas no meio de dez itens que bateram certinho. Aqui as linhas são
 * agrupadas por gravidade, do que exige ação para o que já está resolvido.
 */

/** Diferença abaixo disto é arredondamento de centavo, não cobrança errada. */
export const CENT_TOLERANCE = 0.005;

export type Severity =
  /** pagou mais que o anunciado — o motivo de o app existir */
  | 'overpaid'
  /** não apareceu no cupom, ou apareceu em quantidade menor que a prevista */
  | 'missing'
  /** veio no cupom além do que a lista previa */
  | 'extra'
  /** o preço só existia no caixa, então não há o que conferir */
  | 'unpriced'
  /** bateu, ou saiu mais barato */
  | 'settled';

/** A ordem em que os grupos aparecem: primeiro o que dói, por último o que já está certo. */
export const SEVERITY_ORDER: readonly Severity[] = [
  'overpaid',
  'missing',
  'extra',
  'unpriced',
  'settled',
];

export interface CheckRow {
  readonly kind: 'check';
  readonly check: Check;
  /** `null` para item cujo preço só se descobre no caixa */
  readonly announced: number | null;
  /** a soma das Linhas do cupom, pelo preço cheio que o portal mostra */
  readonly paid: number;
  /**
   * Quanto do Desconto do cupom ficou com este item. Pode ser menos do que
   * você atribuiu, se o saldo do desconto não cobria tudo.
   */
  readonly discounted: number;
  /**
   * positivo = pagou a mais, já com o desconto atribuído; `null` quando não
   * havia preço anunciado
   */
  readonly diff: number | null;
  /**
   * Quanto cada unidade saiu mais cara que o anunciado.
   *
   * `null` quando a conta não faria sentido: item de uma unidade só (a
   * diferença já é a total), ou quando o cupom trouxe uma quantidade diferente
   * da prevista — aí a diferença mistura preço errado com quantidade errada, e
   * dividir uma pela outra mentiria.
   */
  readonly unitDiff: number | null;
}

export interface UnmatchedRow {
  readonly kind: 'unmatched';
  readonly entry: Unmatched;
  readonly paid: number;
}

export type ReviewRow = CheckRow | UnmatchedRow;

export interface ReviewGroup {
  readonly severity: Severity;
  readonly rows: readonly ReviewRow[];
}

export interface Review {
  readonly groups: readonly ReviewGroup[];
  /** só o que tinha preço anunciado — o resto não dá para somar */
  readonly announced: number;
  /**
   * Tudo que saiu do seu bolso, inclusive o que não tinha preço previsto, já
   * com o Desconto do cupom abatido — é o "Valor a pagar" da nota.
   */
  readonly paid: number;
  /** Desconto do cupom inteiro, já abatido de `paid` */
  readonly discount: number;
  /** a parte do desconto que ainda não foi ligada a nenhum item */
  readonly unallocatedDiscount: number;
  /** quanto do pago veio de itens sem preço anunciado */
  readonly unpricedPaid: number;
  /**
   * A diferença que o app se propõe a responder, já sem os itens sem preço:
   * cobrá-los de um total que nunca existiu faria o prejuízo parecer maior do
   * que foi.
   */
  readonly comparableDiff: number;
  /** quantos itens previstos não fecharam: cobrados a mais ou nem encontrados */
  readonly divergingCount: number;
}

function paidFor(check: Check): number {
  return check.matches.reduce((sum, match) => sum + measureTotal(match.line.measure), 0);
}

function severityOf(row: ReviewRow): Severity {
  if (row.kind === 'unmatched') return 'extra';

  const { matches, matchedUnits, planned } = row.check;

  // Estava na lista e não veio: vale tanto para quem tinha preço quanto para
  // quem não tinha, porque em ambos os casos a compra não aconteceu.
  if (matches.length === 0) return 'missing';

  // Sem preço anunciado não há conferência possível: o item apareceu, custou o
  // que custou, e dizer que está "certo" ou "errado" seria invenção.
  if (row.diff === null) return 'unpriced';

  if (row.diff > CENT_TOLERANCE) return 'overpaid';

  // Faltar unidade não é economia. Prever 8 e achar 5 sai "R$ 14,97 a menos",
  // o que numa lista de "conferido, sem problema" leria como se estivesse tudo
  // certo — quando na verdade três itens não apareceram no cupom.
  if (matchedUnits < planned.quantity) return 'missing';

  return 'settled';
}

/**
 * Dentro de um grupo, o maior valor primeiro: entre três cobranças erradas, a
 * de R$ 14 importa mais que a de R$ 0,50. Nos grupos sem valor a comparar
 * (`missing`), a ordem da sua lista é mantida, que é mais previsível.
 */
function sortWithin(severity: Severity, rows: ReviewRow[]): ReviewRow[] {
  if (severity === 'overpaid') {
    // neste grupo diff nunca é null, mas o tipo não sabe disso
    return [...rows].sort((a, b) => ((b as CheckRow).diff ?? 0) - ((a as CheckRow).diff ?? 0));
  }
  if (severity === 'extra') {
    return [...rows].sort((a, b) => b.paid - a.paid);
  }
  return rows;
}

/**
 * O Desconto do cupom inteiro sai do total pago. Do veredito de cada item, só
 * sai a parte que você atribuiu a ele: a nota não diz de qual item o desconto
 * saiu, e escolher um sozinho seria inventar.
 */
export function reviewAssignment(
  assignment: Assignment,
  { total: discount, allocations }: CouponDiscount = NO_DISCOUNT,
): Review {
  const rows: ReviewRow[] = [];

  // Atribuir nunca passa do que a nota informou, nem se o desconto for
  // diminuído depois: quem vem antes na lista fica com o saldo primeiro. Sem
  // esse teto, o botão de desconto apagaria qualquer cobrança errada.
  let remaining = discount;

  for (const check of assignment.checks) {
    const announced = plannedTotal(check.planned);
    const paid = paidFor(check);

    // Item sem preço anunciado ou que nem apareceu não tem diferença para o
    // desconto explicar.
    const wanted =
      announced !== null && check.matches.length > 0 ? (allocations[check.planned.id] ?? 0) : 0;
    const discounted = Math.max(0, Math.min(wanted, remaining));
    remaining -= discounted;

    const diff = announced === null ? null : paid - discounted - announced;

    const quantity = check.planned.quantity;
    const comparable =
      diff !== null && check.matches.length > 0 && check.matchedUnits === quantity && quantity > 1;

    rows.push({
      kind: 'check',
      check,
      announced,
      paid,
      discounted,
      diff,
      unitDiff: comparable && diff !== null ? diff / quantity : null,
    });
  }

  for (const entry of assignment.unmatched) {
    rows.push({ kind: 'unmatched', entry, paid: measureTotal(entry.line.measure) });
  }

  const groups: ReviewGroup[] = [];
  for (const severity of SEVERITY_ORDER) {
    const inGroup = rows.filter((row) => severityOf(row) === severity);
    if (inGroup.length > 0) groups.push({ severity, rows: sortWithin(severity, inGroup) });
  }

  const announced = rows.reduce((sum, row) => sum + (row.kind === 'check' ? (row.announced ?? 0) : 0), 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0) - discount;

  const unpricedPaid = rows.reduce(
    (sum, row) => sum + (severityOf(row) === 'unpriced' ? row.paid : 0),
    0,
  );

  const divergingCount = rows.filter((row) => {
    const severity = severityOf(row);
    return severity === 'overpaid' || severity === 'missing';
  }).length;

  return {
    groups,
    announced,
    paid,
    discount,
    unallocatedDiscount: remaining,
    unpricedPaid,
    comparableDiff: paid - unpricedPaid - announced,
    divergingCount,
  };
}
