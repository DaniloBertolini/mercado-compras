import { describe, expect, it } from 'vitest';
import { assignReceipt } from './assign.js';
import { total } from './measure.js';
import type { PlannedItem, ReceiptLine } from './types.js';

/**
 * Os cenários daqui vieram de compras reais, conferidas à mão no cupom fiscal.
 * Quando um deles falhar, é porque a distribuição regrediu de verdade — não
 * porque "o teste ficou desatualizado".
 */

let seq = 0;

function planned(name: string, quantity: number, unitPrice: number): PlannedItem {
  return { id: `p${++seq}`, name, quantity, unitPrice };
}

function line(name: string, count: number, unitPrice: number): ReceiptLine {
  return { id: `l${++seq}`, name, measure: { kind: 'units', count, unitPrice } };
}

function weighed(name: string, kilos: number, pricePerKilo: number): ReceiptLine {
  return { id: `l${++seq}`, name, measure: { kind: 'weight', kilos, pricePerKilo } };
}

function matchedNames(checks: readonly { matches: readonly { line: ReceiptLine }[] }[], index: number) {
  return checks[index]?.matches.map((m) => m.line.name) ?? [];
}

describe('esmalte e acetona', () => {
  // O removedor de esmalte tem as duas palavras no nome: "REMOV ESMALTE ENCASA
  // FR 50ML C/ACETONA". Antes, "Esmalte" vinha primeiro na lista e levava as
  // duas linhas, deixando "Acetona" sem nada.
  const esmalte = planned('Esmalte', 1, 7.49);
  const acetona = planned('Acetona', 1, 3.89);
  const risque = line('ESMALTE RISQUE BL 8ML CR ASTRAL', 1, 7.49);
  const removedor = line('REMOV ESMALTE ENCASA FR 50ML C/ACETONA', 1, 3.89);

  it('dá a cada um a sua linha', () => {
    const { checks, unmatched } = assignReceipt([esmalte, acetona], [risque, removedor]);

    expect(matchedNames(checks, 0)).toEqual([risque.name]);
    expect(matchedNames(checks, 1)).toEqual([removedor.name]);
    expect(unmatched).toHaveLength(0);
  });

  it('não depende da ordem em que você digitou a lista', () => {
    const { checks } = assignReceipt([acetona, esmalte], [risque, removedor]);

    expect(matchedNames(checks, 0)).toEqual([removedor.name]);
    expect(matchedNames(checks, 1)).toEqual([risque.name]);
  });
});

describe('três bandejas de bife com pesos diferentes', () => {
  // Cada bandeja foi anotada pelo total da etiqueta; no cupom, cada uma é uma
  // linha por peso a R$ 54,90 o quilo. O nome é idêntico nas três, então só o
  // preço as distingue.
  const lines = [
    weighed('COXAO DE FORA BOV BIFE kg', 0.376, 54.9),
    weighed('COXAO DE FORA BOV BIFE kg', 0.435, 54.9),
    weighed('COXAO DE FORA BOV BIFE kg', 0.439, 54.9),
  ] as const;

  it('casa cada bandeja com a sua, pelo preço', () => {
    const { checks } = assignReceipt(
      [planned('Bife', 1, 23.88), planned('Bife', 1, 24.1), planned('Bife', 1, 20.64)],
      lines,
    );

    const totals = checks.map((check) => check.matches.map((m) => total(m.line.measure)));
    expect(totals[0]?.[0]).toBeCloseTo(23.88, 2);
    expect(totals[1]?.[0]).toBeCloseTo(24.1, 2);
    expect(totals[2]?.[0]).toBeCloseTo(20.64, 2);
  });

  it('conta cada bandeja como uma unidade, não como 0,4', () => {
    const { checks } = assignReceipt([planned('Bife', 3, 22.87)], lines);

    // três bandejas somam 1,25 kg — o que importa é que são 3 unidades
    expect(checks[0]?.matchedUnits).toBe(3);
  });
});

describe('chocolate e bolacha Minueto', () => {
  // "BISC MINUETO WAFER PC 81G CHOC/BAUN" tem "CHOC", abreviação de chocolate.
  // Palavra inteira tem que vencer abreviação, senão a bolacha entra no lugar
  // de um chocolate de verdade.
  const chocolate = planned('Chocolate', 8, 4.99);
  const minueto = planned('Minueto', 2, 1.89);
  const bolachas = [
    line('BISC MINUETO WAFER PC 81G CHOC/BAUN', 1, 1.89),
    line('BISC MINUETO WAFER PC 81G CHOC/BAUN', 1, 1.89),
  ];
  const barras = Array.from({ length: 8 }, () => line('CHOC NEUGEBAUER BR 80G AO LEITE', 1, 4.99));

  it('manda as Minueto para a Minueto e as barras para o chocolate', () => {
    const { checks, unmatched } = assignReceipt(
      [chocolate, minueto],
      [...bolachas, ...barras],
    );

    expect(matchedNames(checks, 0)).toEqual(barras.map((b) => b.name));
    expect(matchedNames(checks, 1)).toEqual(bolachas.map((b) => b.name));
    expect(unmatched).toHaveLength(0);
  });

  it('para na quantidade prevista e marca o resto como Excedente', () => {
    const noveBarras = [...barras, line('CHOC NEUGEBAUER BR 80G AO LEITE', 1, 4.99)];
    const { checks, unmatched } = assignReceipt([chocolate], noveBarras);

    expect(checks[0]?.matchedUnits).toBe(8);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.surplusOf?.name).toBe('Chocolate');
  });
});

describe('Ajustes manuais', () => {
  // "BISC CASAREDO PC 500G CHOCOLATE" é bolacha, mas a palavra "chocolate" está
  // inteira e correta: nenhuma heurística de nome resolve. Só você sabe.
  const chocolate = planned('Chocolate', 2, 4.99);
  const casaredo = line('BISC CASAREDO PC 500G CHOCOLATE', 1, 7.49);
  const barra = line('CHOC NEUGEBAUER BR 80G AO LEITE', 1, 4.99);

  it('sem ajuste, a bolacha ocupa uma vaga do chocolate', () => {
    const { checks } = assignReceipt([chocolate], [casaredo, barra]);
    expect(matchedNames(checks, 0)).toContain(casaredo.name);
  });

  it('marcada como Fora da lista, a bolacha libera a vaga', () => {
    const { checks, unmatched } = assignReceipt([chocolate], [casaredo, barra], {
      [casaredo.id]: null,
    });

    expect(matchedNames(checks, 0)).toEqual([barra.name]);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.manual).toBe(true);
    expect(unmatched[0]?.surplusOf).toBeNull();
  });

  it('fura a quantidade prevista quando você mandou', () => {
    const esmalte = planned('Esmalte', 1, 7.49);
    const risque = line('ESMALTE RISQUE BL 8ML CR ASTRAL', 1, 7.49);
    const removedor = line('REMOV ESMALTE ENCASA FR 50ML C/ACETONA', 1, 3.89);

    const { checks, unmatched } = assignReceipt([esmalte], [risque, removedor], {
      [removedor.id]: esmalte.id,
    });

    // você mandou o removedor para o Esmalte, que só previa 1 unidade
    expect(matchedNames(checks, 0)).toEqual([removedor.name]);
    expect(checks[0]?.matches[0]?.manual).toBe(true);
    expect(unmatched[0]?.line.name).toBe(risque.name);
  });

  it('ignora ajuste que aponta para um Previsto apagado', () => {
    const { checks } = assignReceipt([chocolate], [barra], { [barra.id]: 'p-que-nao-existe' });

    // cai na distribuição automática em vez de sumir
    expect(matchedNames(checks, 0)).toEqual([barra.name]);
  });
});

describe('o que o cupom traz e a lista não previa', () => {
  it('separa Excedente de Fora da lista', () => {
    const arroz = planned('Arroz', 1, 29.9);
    const arrozLinha = line('ARROZ TIO JOAO 5KG', 1, 29.9);
    const arrozExtra = line('ARROZ TIO JOAO 5KG', 1, 29.9);
    const pilha = line('PILHA DURACELL AA 4UN', 1, 19.9);

    const { unmatched } = assignReceipt([arroz], [arrozLinha, arrozExtra, pilha]);

    expect(unmatched).toHaveLength(2);
    expect(unmatched[0]?.surplusOf?.name).toBe('Arroz'); // excedente
    expect(unmatched[1]?.surplusOf).toBeNull(); // fora da lista
  });
});

describe('regressões que já funcionavam', () => {
  it('entende abreviação do cupom', () => {
    const { checks } = assignReceipt(
      [planned('desodorante', 1, 12.9)],
      [line('DESOD AER REXONA 150ML', 1, 12.9)],
    );
    expect(checks[0]?.matches).toHaveLength(1);
  });

  it('entende ordem de palavras trocada', () => {
    const { checks } = assignReceipt(
      [planned('papel toalha', 1, 8.5)],
      [line('TOALHA PAPEL SCOTT 2UN', 1, 9.9)],
    );
    expect(checks[0]?.matches).toHaveLength(1);
  });

  it('junta sabores diferentes no mesmo Previsto', () => {
    const { checks, unmatched } = assignReceipt(
      [planned('pizza', 2, 15)],
      [line('PIZZA SADIA CALABRESA 460G', 1, 15), line('PIZZA SADIA MUSSARELA 460G', 1, 17.5)],
    );

    expect(checks[0]?.matches).toHaveLength(2);
    expect(unmatched).toHaveLength(0);
  });

  it('aceita uma linha só valendo várias unidades', () => {
    const { checks } = assignReceipt(
      [planned('hamburguer', 12, 2.5)],
      [line('HAMBURGUER SEARA 56G', 12, 2.5)],
    );
    expect(checks[0]?.matchedUnits).toBe(12);
  });

  it('deixa o Previsto vazio quando nada se parece', () => {
    const { checks, unmatched } = assignReceipt(
      [planned('guarana', 1, 9)],
      [line('ARROZ TIO JOAO 5KG', 1, 29.9)],
    );

    expect(checks[0]?.matches).toHaveLength(0);
    expect(unmatched[0]?.surplusOf).toBeNull();
  });
});

describe('leite, chocolate e leite condensado', () => {
  // Compra real. Tres armadilhas de uma vez: o chocolate tem a palavra "leite"
  // no nome ("AO LEITE"), o cupom abrevia condensado como "COND", e o previsto
  // "Leite" e mais generico que "Leite condensado".
  const leite = planned('Leite', 8, 4.39);
  const chocolate = planned('Chocolate', 8, 4.99);
  const condensado = planned('Leite condensado', 5, 4.99);

  const barras = Array.from({ length: 8 }, () => line('CHOC NEUGEBAUER BR 80G AO LEITE', 1, 4.99));
  const latas = Array.from({ length: 5 }, () => line('LEITE COND TIROL TP 395G', 1, 4.99));

  it('manda as latas para "Leite condensado", nao para "Leite"', () => {
    const { checks } = assignReceipt([leite, chocolate, condensado], [...latas, ...barras]);
    expect(matchedNames(checks, 2)).toEqual(latas.map((l) => l.name));
  });

  it('nao deixa "Leite" roubar o chocolate por causa do "AO LEITE"', () => {
    const { checks } = assignReceipt([leite, chocolate, condensado], [...latas, ...barras]);
    expect(matchedNames(checks, 1)).toEqual(barras.map((b) => b.name));
  });

  it('deixa "Leite" sem correspondencia, porque nao ha leite no cupom', () => {
    const { checks } = assignReceipt([leite, chocolate, condensado], [...latas, ...barras]);
    expect(checks[0]?.matches).toHaveLength(0);
  });
});

describe('bolacha de chocolate contra chocolate de verdade', () => {
  // "BISC CASAREDO PC 500G CHOCOLATE" tem a palavra inteira e correta, mas no
  // fim do nome: o produto ali e biscoito. Com vaga apertada, o chocolate de
  // verdade deve levar.
  it('a barra ganha a unica vaga', () => {
    const chocolate = planned('Chocolate', 1, 4.99);
    const casaredo = line('BISC CASAREDO PC 500G CHOCOLATE', 1, 7.49);
    const barra = line('CHOC NEUGEBAUER BR 80G AO LEITE', 1, 4.99);

    const { checks, unmatched } = assignReceipt([chocolate], [casaredo, barra]);

    expect(matchedNames(checks, 0)).toEqual([barra.name]);
    expect(unmatched[0]?.line.name).toBe(casaredo.name);
  });
});
