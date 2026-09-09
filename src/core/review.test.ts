import { describe, expect, it } from 'vitest';
import { assignReceipt } from './assign.js';
import { reviewAssignment, type CheckRow, type Severity } from './review.js';
import type { PlannedItem, ReceiptLine } from './types.js';

let seq = 0;
const prev = (name: string, quantity: number, unitPrice: number): PlannedItem => ({
  id: `p${++seq}`,
  name,
  quantity,
  unitPrice,
});
const line = (name: string, unitPrice: number, count = 1): ReceiptLine => ({
  id: `l${++seq}`,
  name,
  measure: { kind: 'units', count, unitPrice },
});

function review(planned: PlannedItem[], lines: ReceiptLine[]) {
  return reviewAssignment(assignReceipt(planned, lines));
}

const severities = (r: ReturnType<typeof review>): Severity[] => r.groups.map((g) => g.severity);

describe('ordem dos grupos', () => {
  it('põe o que foi cobrado a mais antes de tudo', () => {
    const r = review(
      [prev('Arroz', 1, 20), prev('Feijão', 1, 8), prev('Pão', 1, 5)],
      [
        line('ARROZ TIO JOAO 5KG', 20), // bateu
        line('FEIJAO CARIOCA 1KG', 12), // cobrado a mais
        line('PAO FRANCES KG', 5), // bateu
        line('PILHA DURACELL AA', 19.9), // fora da lista
      ],
    );

    expect(severities(r)).toEqual(['overpaid', 'extra', 'settled']);
  });

  it('coloca o não encontrado logo depois do cobrado a mais', () => {
    const r = review(
      [prev('Arroz', 1, 20), prev('Guaraná', 1, 9)],
      [line('ARROZ TIO JOAO 5KG', 25)],
    );

    expect(severities(r)).toEqual(['overpaid', 'missing']);
  });

  it('não cria grupo vazio', () => {
    const r = review([prev('Arroz', 1, 20)], [line('ARROZ TIO JOAO 5KG', 20)]);
    expect(severities(r)).toEqual(['settled']);
  });
});

describe('ordem dentro do grupo', () => {
  it('mostra o prejuízo maior primeiro', () => {
    const r = review(
      [prev('Arroz', 1, 20), prev('Feijão', 1, 8), prev('Café', 1, 15)],
      [
        line('ARROZ TIO JOAO 5KG', 22), // +2
        line('FEIJAO CARIOCA 1KG', 23), // +15
        line('CAFE PILAO 500G', 20), // +5
      ],
    );

    const overpaid = r.groups[0]?.rows as CheckRow[];
    expect(overpaid.map((row) => row.check.planned.name)).toEqual(['Feijão', 'Café', 'Arroz']);
  });

  it('mostra a compra extra mais cara primeiro', () => {
    const r = review(
      [prev('Arroz', 1, 20)],
      [line('ARROZ TIO JOAO 5KG', 20), line('CHOCOLATE', 5), line('VINHO TINTO', 45)],
    );

    const extras = r.groups.find((g) => g.severity === 'extra')?.rows ?? [];
    expect(extras.map((row) => row.paid)).toEqual([45, 5]);
  });
});

describe('o que conta como problema', () => {
  it('pagar menos que o anunciado não é problema', () => {
    const r = review([prev('Arroz', 1, 20)], [line('ARROZ TIO JOAO 5KG', 15)]);

    expect(severities(r)).toEqual(['settled']);
    expect(r.divergingCount).toBe(0);
  });

  it('diferença de centavo é arredondamento, não cobrança errada', () => {
    const r = review([prev('Banana', 3, 3.33)], [line('BANANA PRATA KG', 10)]);

    // 3 x 3,33 = 9,99 contra 10,00
    expect(severities(r)).toEqual(['overpaid']);

    const semDiferenca = review([prev('Banana', 3, 3.3333)], [line('BANANA PRATA KG', 10)]);
    expect(severities(semDiferenca)).toEqual(['settled']);
  });

  it('conta como divergente o cobrado a mais e o não encontrado', () => {
    const r = review(
      [prev('Arroz', 1, 20), prev('Guaraná', 1, 9), prev('Pão', 1, 5)],
      [line('ARROZ TIO JOAO 5KG', 25), line('PAO FRANCES KG', 5), line('PILHA AA', 19.9)],
    );

    // arroz cobrado a mais + guaraná não encontrado; a pilha extra não conta
    expect(r.divergingCount).toBe(2);
  });
});

describe('totais', () => {
  it('somam tudo, inclusive o que não estava na lista', () => {
    const r = review(
      [prev('Arroz', 1, 20), prev('Guaraná', 1, 9)],
      [line('ARROZ TIO JOAO 5KG', 25), line('PILHA AA', 10)],
    );

    expect(r.announced).toBeCloseTo(29, 2); // 20 + 9
    expect(r.paid).toBeCloseTo(35, 2); // 25 + 10
  });

  it('multiplicam pela quantidade', () => {
    const r = review([prev('Chocolate', 8, 4.99)], [line('CHOC NEUGEBAUER', 4.99, 8)]);

    expect(r.announced).toBeCloseTo(39.92, 2);
    expect(r.paid).toBeCloseTo(39.92, 2);
  });
});
