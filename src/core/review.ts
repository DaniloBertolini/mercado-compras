import type { Assignment, Check, Unmatched } from './assign.js';
import { total as measureTotal } from './measure.js';
import { plannedTotal } from './types.js';

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
  /** bateu, ou saiu mais barato */
  | 'settled';

/** A ordem em que os grupos aparecem: primeiro o que dói, por último o que já está certo. */
export const SEVERITY_ORDER: readonly Severity[] = ['overpaid', 'missing', 'extra', 'settled'];

export interface CheckRow {
  readonly kind: 'check';
  readonly check: Check;
  readonly announced: number;
  readonly paid: number;
  /** positivo = pagou a mais */
  readonly diff: number;
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
  readonly announced: number;
  readonly paid: number;
  /** quantos itens previstos não fecharam: cobrados a mais ou nem encontrados */
  readonly divergingCount: number;
}

function paidFor(check: Check): number {
  return check.matches.reduce((sum, match) => sum + measureTotal(match.line.measure), 0);
}

function severityOf(row: ReviewRow): Severity {
  if (row.kind === 'unmatched') return 'extra';
  if (row.diff > CENT_TOLERANCE) return 'overpaid';

  // Faltar unidade não é economia. Prever 8 e achar 5 sai "R$ 14,97 a menos",
  // o que numa lista de "conferido, sem problema" leria como se estivesse tudo
  // certo — quando na verdade três itens não apareceram no cupom.
  const { matches, matchedUnits, planned } = row.check;
  if (matches.length === 0 || matchedUnits < planned.quantity) return 'missing';

  return 'settled';
}

/**
 * Dentro de um grupo, o maior valor primeiro: entre três cobranças erradas, a
 * de R$ 14 importa mais que a de R$ 0,50. Nos grupos sem valor a comparar
 * (`missing`), a ordem da sua lista é mantida, que é mais previsível.
 */
function sortWithin(severity: Severity, rows: ReviewRow[]): ReviewRow[] {
  if (severity === 'overpaid') {
    return [...rows].sort((a, b) => (b as CheckRow).diff - (a as CheckRow).diff);
  }
  if (severity === 'extra') {
    return [...rows].sort((a, b) => b.paid - a.paid);
  }
  return rows;
}

export function reviewAssignment(assignment: Assignment): Review {
  const rows: ReviewRow[] = [];

  for (const check of assignment.checks) {
    const announced = plannedTotal(check.planned);
    const paid = paidFor(check);
    const diff = paid - announced;

    const quantity = check.planned.quantity;
    const comparable = check.matches.length > 0 && check.matchedUnits === quantity && quantity > 1;

    rows.push({
      kind: 'check',
      check,
      announced,
      paid,
      diff,
      unitDiff: comparable ? diff / quantity : null,
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

  const announced = rows.reduce((sum, row) => sum + (row.kind === 'check' ? row.announced : 0), 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  const divergingCount = rows.filter((row) => {
    const severity = severityOf(row);
    return severity === 'overpaid' || severity === 'missing';
  }).length;

  return { groups, announced, paid, divergingCount };
}
