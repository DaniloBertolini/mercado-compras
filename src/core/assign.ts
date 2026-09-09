import { MATCH_THRESHOLD, matchScore, tokenize } from './naming.js';
import { total, units } from './measure.js';
import { plannedTotal, type Adjustments, type PlannedItem, type ReceiptLine } from './types.js';

/** Correspondência — uma Linha do cupom reconhecida como pertencente a um Previsto. */
export interface Match {
  readonly line: ReceiptLine;
  /** veio de um Ajuste manual, não da distribuição automática */
  readonly manual: boolean;
}

/** Conferência — um Previsto e as Linhas do cupom que couberam nele. */
export interface Check {
  readonly planned: PlannedItem;
  readonly matches: readonly Match[];
  /** unidades encontradas, para comparar com `planned.quantity` */
  readonly matchedUnits: number;
}

/** Linha do cupom que nenhum Previsto levou. */
export interface Unmatched {
  readonly line: ReceiptLine;
  readonly manual: boolean;
  /**
   * Excedente: o Previsto que reconheceu esta linha como sua mas já tinha
   * atingido a quantidade prevista. `null` significa Fora da lista — ninguém a
   * reclamou.
   */
  readonly surplusOf: PlannedItem | null;
}

export interface Assignment {
  readonly checks: readonly Check[];
  readonly unmatched: readonly Unmatched[];
}

interface Bucket {
  readonly planned: PlannedItem;
  readonly tokens: readonly string[];
  readonly plannedTotal: number;
  readonly matches: Match[];
  units: number;
}

interface Candidate {
  readonly bucket: Bucket;
  readonly line: ReceiptLine;
  readonly score: number;
  readonly priceGap: number;
}

/**
 * Distribui as Linhas do cupom entre os Previstos.
 *
 * Cada Linha pertence a UM Previsto. A versão anterior percorria os Previstos
 * em ordem e cada um levava tudo que parecia com ele: como "Esmalte" vinha
 * antes de "Acetona", engolia as duas linhas e a acetona ficava órfã. O
 * problema era a distribuição, não a semelhança.
 *
 * Aqui todos os pares possíveis são montados e distribuídos do mais forte para
 * o mais fraco, com três critérios que se aplicam nesta ordem:
 *
 * 1. Ajuste manual manda, e sai da disputa antes de tudo.
 * 2. Nome primeiro; empatado o nome, leva quem tem o preço mais próximo — é o
 *    que separa três bandejas de bife pesadas diferente.
 * 3. Cada Previsto para ao atingir a quantidade prevista.
 */
export function assignReceipt(
  planned: readonly PlannedItem[],
  lines: readonly ReceiptLine[],
  adjustments: Adjustments = {},
): Assignment {
  const buckets: Bucket[] = planned.map((item) => ({
    planned: item,
    tokens: tokenize(item.name),
    plannedTotal: plannedTotal(item),
    matches: [],
    units: 0,
  }));

  const bucketByPlannedId = new Map(buckets.map((bucket) => [bucket.planned.id, bucket]));
  const takenBy = new Map<string, Bucket>();
  const manualLines = new Set<string>();
  const forcedOut = new Set<string>();
  const wantedBy = new Map<string, PlannedItem>();

  // 1) O que você ajustou à mão manda, inclusive furando a quantidade prevista:
  // se apontou para ali, é ali.
  for (const line of lines) {
    if (!Object.prototype.hasOwnProperty.call(adjustments, line.id)) continue;
    const target = adjustments[line.id];

    if (target === null) {
      forcedOut.add(line.id);
      manualLines.add(line.id);
      continue;
    }

    const bucket = target === undefined ? undefined : bucketByPlannedId.get(target);
    if (!bucket) continue; // Previsto apagado: deixa a distribuição automática decidir

    manualLines.add(line.id);
    bucket.matches.push({ line, manual: true });
    bucket.units += units(line.measure);
    takenBy.set(line.id, bucket);
  }

  // 2) Todos os pares que passam do limiar, para o resto das linhas.
  const lineTokens = new Map(lines.map((line) => [line.id, tokenize(line.name)]));
  const candidates: Candidate[] = [];

  for (const bucket of buckets) {
    for (const line of lines) {
      if (takenBy.has(line.id) || forcedOut.has(line.id)) continue;
      const score = matchScore(bucket.tokens, lineTokens.get(line.id) ?? []);
      if (score < MATCH_THRESHOLD) continue;
      candidates.push({
        bucket,
        line,
        score,
        priceGap: Math.abs(total(line.measure) - bucket.plannedTotal),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.priceGap - b.priceGap);

  // 3) Distribui do par mais forte para o mais fraco, respeitando a quantidade.
  for (const candidate of candidates) {
    if (takenBy.has(candidate.line.id)) continue;

    if (candidate.bucket.units >= candidate.bucket.planned.quantity) {
      if (!wantedBy.has(candidate.line.id)) {
        wantedBy.set(candidate.line.id, candidate.bucket.planned);
      }
      continue;
    }

    candidate.bucket.matches.push({ line: candidate.line, manual: false });
    candidate.bucket.units += units(candidate.line.measure);
    takenBy.set(candidate.line.id, candidate.bucket);
  }

  return {
    checks: buckets.map((bucket) => ({
      planned: bucket.planned,
      matches: bucket.matches,
      matchedUnits: bucket.units,
    })),
    unmatched: lines
      .filter((line) => !takenBy.has(line.id))
      .map((line) => ({
        line,
        manual: manualLines.has(line.id),
        surplusOf: wantedBy.get(line.id) ?? null,
      })),
  };
}
