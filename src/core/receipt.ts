import type { Measure } from './measure.js';

/**
 * Leitura do texto copiado do portal da NFC-e.
 *
 * Os portais listam cada item em blocos como:
 *
 *     NOME DO PRODUTO (Código: 12345 )
 *     Qtde.:1  UN: UN1  Vl. Unit.:   19,99   Vl. Total
 *     19,99
 *
 * ou seja: o rótulo "Vl. Total" fica numa linha e o valor sozinho na seguinte.
 */

/** Linha bruta — o que saiu do texto, antes de você confirmar que ela entra. */
export interface RawLine {
  readonly name: string;
  readonly measure: Measure;
  /**
   * O total como o cupom o informou, para a pré-visualização. Pode divergir de
   * `total(measure)` por centavos, porque o cupom arredonda o preço unitário.
   */
  readonly displayTotal: number;
}

const CODE_STRIP_RE = /\s*\(c[oó]digo:?\s*\d+\s*\)\s*/i;
const QTY_RE = /qtde\.?:?\s*([\d.,]+)/i;
const UNIT_RE = /vl\.?\s*unit(?:[aá]rio)?\.?:?\s*([\d.,]+)/i;
const TOTAL_RE = /vl\.?\s*total:?\s*([\d.,]+)/i;
const TOTAL_LABEL_ONLY_RE = /vl\.?\s*total\s*$/i;
const BARE_NUMBER_RE = /^[\d.,]+$/;
const WEIGHT_RE = /un:\s*kg/i;
const LABEL_RE =
  /^(c[oó]digo|qtde|un\b|un:|un\.|vl\.|valor|desconto|item\s*\d|total\s*da\s*nota|consumidor|emitente|chave|protocolo)/i;

/** Lê um número no formato brasileiro: "1.234,56" vira 1234.56. */
export function parseBRLNumber(text: string | null | undefined): number {
  if (text == null) return NaN;
  let cleaned = String(text).trim();
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  return parseFloat(cleaned);
}

/** Estado intermediário: os campos chegam espalhados por várias linhas de texto. */
interface Draft {
  name: string | null;
  qty: number | null;
  unitPrice: number | null;
  total: number | null;
  isWeight: boolean;
}

function emptyDraft(): Draft {
  return { name: null, qty: null, unitPrice: null, total: null, isWeight: false };
}

function toRawLine(draft: Draft): RawLine | null {
  if (draft.name === null) return null;

  const qty = draft.qty ?? 1;
  const price =
    draft.unitPrice ?? (draft.total !== null && qty !== 0 ? draft.total / qty : 0);
  const rounded = Math.round(price * 100) / 100;
  const displayTotal = draft.total ?? (draft.unitPrice ?? 0) * qty;

  return {
    name: draft.name,
    measure: draft.isWeight
      ? { kind: 'weight', kilos: qty, pricePerKilo: rounded }
      : { kind: 'units', count: qty, unitPrice: rounded },
    displayTotal,
  };
}

export function parseReceiptText(text: string): RawLine[] {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let expectTotalNext = false;

  function finalize(): void {
    if (current && current.name && (current.unitPrice !== null || current.total !== null)) {
      drafts.push(current);
    }
    current = null;
    expectTotalNext = false;
  }

  for (const line of lines) {
    if (expectTotalNext && BARE_NUMBER_RE.test(line)) {
      if (current) current.total = parseBRLNumber(line);
      finalize();
      continue;
    }
    expectTotalNext = false;

    const qtyMatch = line.match(QTY_RE);
    const unitMatch = line.match(UNIT_RE);
    const totalMatch = line.match(TOTAL_RE);

    if (qtyMatch || unitMatch || totalMatch) {
      current ??= emptyDraft();
      if (qtyMatch?.[1]) current.qty = parseBRLNumber(qtyMatch[1]);
      if (unitMatch?.[1]) current.unitPrice = parseBRLNumber(unitMatch[1]);
      if (totalMatch?.[1]) current.total = parseBRLNumber(totalMatch[1]);
      if (WEIGHT_RE.test(line)) current.isWeight = true;

      if (!totalMatch && TOTAL_LABEL_ONLY_RE.test(line)) {
        expectTotalNext = true;
      } else {
        finalize();
      }
      continue;
    }

    if (LABEL_RE.test(line)) continue;

    // linha de nome de produto
    if (current?.name) current = null;
    const cleanName = line.replace(CODE_STRIP_RE, '').trim();
    if (!cleanName) continue;
    current ??= emptyDraft();
    current.name = current.name ? `${current.name} ${cleanName}` : cleanName;
  }

  return drafts.map(toRawLine).filter((line): line is RawLine => line !== null);
}
