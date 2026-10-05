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
    // um item só, para isolar a tolerância da questão de quantidade
    const umCentavo = review([prev('Banana', 1, 9.99)], [line('BANANA PRATA KG', 10)]);
    expect(severities(umCentavo)).toEqual(['overpaid']);

    const fracaoDeCentavo = review([prev('Banana', 1, 9.9999)], [line('BANANA PRATA KG', 10)]);
    expect(severities(fracaoDeCentavo)).toEqual(['settled']);
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

  it('abatem o desconto do cupom, que a nota não liga a item nenhum', () => {
    // caso real: arroz anunciado a 11,49, que passou a 12,79 com R$ 1,30 de desconto
    const r = reviewAssignment(
      assignReceipt([prev('Arroz Kika', 1, 11.49)], [line('ARROZ KIKA PARBO PC 5kg', 12.79)]),
      { total: 1.3, allocations: {} },
    );

    expect(r.paid).toBeCloseTo(11.49, 2);
    expect(r.discount).toBeCloseTo(1.3, 2);
    expect(r.comparableDiff).toBeCloseTo(0, 2);
  });

  it('multiplicam pela quantidade', () => {
    const r = review([prev('Chocolate', 8, 4.99)], [line('CHOC NEUGEBAUER', 4.99, 8)]);

    expect(r.announced).toBeCloseTo(39.92, 2);
    expect(r.paid).toBeCloseTo(39.92, 2);
  });
});

describe('diferenca por unidade', () => {
  it('diz quanto cada unidade saiu mais cara', () => {
    // caso real: 8 leites anunciados a 4,39 e cobrados a 4,59
    const r = review([prev('Leite', 8, 4.39)], [line('LEITE TIROL INTEG ROSCA TP 1L', 4.59, 8)]);
    const linha = r.groups[0]?.rows[0] as CheckRow;

    expect(linha.diff).toBeCloseTo(1.6, 2);
    expect(linha.unitDiff).toBeCloseTo(0.2, 2);
  });

  it('nao repete a conta quando e uma unidade so', () => {
    const r = review([prev('Arroz', 1, 20)], [line('ARROZ TIO JOAO 5KG', 25)]);
    expect((r.groups[0]?.rows[0] as CheckRow).unitDiff).toBeNull();
  });

  it('nao calcula quando a quantidade encontrada nao bate', () => {
    // 5 de 8 encontrados: a diferenca mistura preco errado com item faltando
    const r = review([prev('Chocolate', 8, 4.99)], [line('CHOC NEUGEBAUER', 4.99, 5)]);
    expect((r.groups[0]?.rows[0] as CheckRow).unitDiff).toBeNull();
  });

  it('vale tambem quando saiu mais barato', () => {
    const r = review([prev('Leite', 4, 5)], [line('LEITE TIROL 1L', 4.5, 4)]);
    const linha = r.groups[0]?.rows[0] as CheckRow;
    expect(linha.unitDiff).toBeCloseTo(-0.5, 2);
  });
});

describe('quantidade incompleta', () => {
  it('nao entra em "conferido" quando faltou unidade', () => {
    // prever 8 e achar 5 sai "R$ 14,97 a menos": parece economia, e nao e
    const r = review([prev('Chocolate', 8, 4.99)], [line('CHOC NEUGEBAUER', 4.99, 5)]);

    expect(severities(r)).toEqual(['missing']);
    expect(r.divergingCount).toBe(1);
  });

  it('cobranca a mais tem prioridade sobre quantidade faltando', () => {
    const r = review([prev('Chocolate', 8, 2)], [line('CHOC NEUGEBAUER', 9, 5)]);
    expect(severities(r)).toEqual(['overpaid']);
  });

  it('quantidade completa e preco certo continuam em conferido', () => {
    const r = review([prev('Chocolate', 8, 4.99)], [line('CHOC NEUGEBAUER', 4.99, 8)]);
    expect(severities(r)).toEqual(['settled']);
  });
});

describe('item sem preco anunciado', () => {
  // Linguica, fruta, carne: na gondola voce ve o produto, mas o valor sai da
  // balanca. Nao e falta de atencao, e informacao que ainda nao existe.
  const semPreco = (name: string): PlannedItem => ({
    id: `p${++seq}`,
    name,
    quantity: 1,
    unitPrice: null,
  });

  it('sai de "alem da lista" e ganha grupo proprio', () => {
    const r = review(
      [semPreco('Linguica')],
      [{ id: 'l1', name: 'LING FRIWANDAL PURA kg', measure: { kind: 'weight', kilos: 0.62, pricePerKilo: 79.9 } }],
    );

    expect(severities(r)).toEqual(['unpriced']);
  });

  it('nao entra na conta da diferenca', () => {
    const r = review(
      [prev('Arroz', 1, 20), semPreco('Linguica')],
      [
        line('ARROZ TIO JOAO 5KG', 22),
        { id: 'l2', name: 'LING FRIWANDAL PURA kg', measure: { kind: 'units', count: 1, unitPrice: 49.54 } },
      ],
    );

    expect(r.unpricedPaid).toBeCloseTo(49.54, 2);
    // so o arroz entra: 22 - 20, e nao 71,54 - 20
    expect(r.comparableDiff).toBeCloseTo(2, 2);
  });

  it('continua somando no total pago, que e dinheiro de verdade', () => {
    const r = review(
      [prev('Arroz', 1, 20), semPreco('Linguica')],
      [line('ARROZ TIO JOAO 5KG', 20), line('LING FRIWANDAL PURA kg', 49.54)],
    );

    expect(r.paid).toBeCloseTo(69.54, 2);
    expect(r.announced).toBeCloseTo(20, 2); // so o que tinha preco
  });

  it('nao conta como divergencia', () => {
    const r = review([semPreco('Linguica')], [line('LING FRIWANDAL PURA kg', 49.54)]);
    expect(r.divergingCount).toBe(0);
  });

  it('continua sendo falta quando nao aparece no cupom', () => {
    // nao comprou a linguica: isso e falta, nao "sem preco"
    const r = review([semPreco('Linguica')], [line('ARROZ TIO JOAO 5KG', 20)]);
    expect(severities(r)).toEqual(['missing', 'extra']);
  });
});

describe('desconto atribuído', () => {
  // caso real: anunciado a 11,49, passou a 12,79, e o cupom de papel mostra
  // R$ 1,30 de desconto embaixo do arroz; a nota inteira teve R$ 14,30
  const arroz = () => prev('Arroz Kika', 1, 11.49);
  const cupom = () => line('ARROZ KIKA PARBO PC 5kg', 12.79);

  function withDiscount(planned: PlannedItem[], lines: ReceiptLine[], total: number, allocations: Record<string, number>) {
    return reviewAssignment(assignReceipt(planned, lines), { total, allocations });
  }

  it('sem atribuir, o item continua cobrado a mais', () => {
    const r = withDiscount([arroz()], [cupom()], 14.3, {});

    expect(severities(r)).toEqual(['overpaid']);
    expect(r.unallocatedDiscount).toBeCloseTo(14.3, 2);
  });

  it('o desconto que explica a diferença leva o item para conferido', () => {
    const item = arroz();
    const r = withDiscount([item], [cupom()], 14.3, { [item.id]: 1.3 });

    const row = r.groups[0]?.rows[0] as CheckRow;
    expect(severities(r)).toEqual(['settled']);
    expect(row.discounted).toBeCloseTo(1.3, 2);
    expect(row.diff).toBeCloseTo(0, 2);
    expect(r.unallocatedDiscount).toBeCloseTo(13, 2);
  });

  it('desconto menor que a diferença deixa só o que foi cobrado a mais de verdade', () => {
    const item = arroz();
    const r = withDiscount([item], [cupom()], 14.3, { [item.id]: 1 });

    const row = r.groups[0]?.rows[0] as CheckRow;
    expect(severities(r)).toEqual(['overpaid']);
    expect(row.diff).toBeCloseTo(0.3, 2);
  });

  it('nunca distribui mais do que a nota informou', () => {
    const a = prev('Arroz', 1, 10);
    const b = prev('Feijão', 1, 5);
    const r = withDiscount(
      [a, b],
      [line('ARROZ TIO JOAO', 13), line('FEIJAO CARIOCA', 8)],
      4,
      { [a.id]: 3, [b.id]: 3 },
    );

    const rows = r.groups.flatMap((g) => g.rows) as CheckRow[];
    const feijao = rows.find((row) => row.check.planned.id === b.id);

    // o arroz, primeiro da lista, leva 3; o feijão fica com o 1 que sobrou
    expect(feijao?.discounted).toBeCloseTo(1, 2);
    expect(feijao?.diff).toBeCloseTo(2, 2);
    expect(r.unallocatedDiscount).toBeCloseTo(0, 2);
  });

  it('não muda o total pago, que já tinha o desconto inteiro abatido', () => {
    const item = arroz();
    const sem = withDiscount([item], [cupom()], 14.3, {});
    const com = withDiscount([item], [cupom()], 14.3, { [item.id]: 1.3 });

    expect(com.paid).toBeCloseTo(sem.paid, 2);
    expect(com.comparableDiff).toBeCloseTo(sem.comparableDiff, 2);
  });

  it('ignora atribuição a item que não apareceu no cupom', () => {
    const item = arroz();
    const r = withDiscount([item], [], 14.3, { [item.id]: 1.3 });

    expect(severities(r)).toEqual(['missing']);
    expect(r.unallocatedDiscount).toBeCloseTo(14.3, 2);
  });
});
