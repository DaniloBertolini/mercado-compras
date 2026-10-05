import { describe, expect, it } from 'vitest';
import { parseBRLNumber, parseReceiptDiscount, parseReceiptText } from './receipt.js';
import { total } from './measure.js';

describe('parseBRLNumber', () => {
  it('entende vírgula decimal e ponto de milhar', () => {
    expect(parseBRLNumber('1.234,56')).toBeCloseTo(1234.56, 2);
    expect(parseBRLNumber('19,99')).toBeCloseTo(19.99, 2);
    expect(parseBRLNumber('54.90')).toBeCloseTo(54.9, 2); // sem vírgula, ponto é decimal
  });

  it('devolve NaN para o que não é número', () => {
    expect(parseBRLNumber(null)).toBeNaN();
    expect(parseBRLNumber('abc')).toBeNaN();
  });
});

describe('parseReceiptText', () => {
  it('lê um item por unidade', () => {
    const lines = parseReceiptText(`
      ESMALTE RISQUE BL 8ML CR ASTRAL (Código: 12345 )
      Qtde.:1  UN: UN1  Vl. Unit.:   7,49   Vl. Total 7,49
    `);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.name).toBe('ESMALTE RISQUE BL 8ML CR ASTRAL');
    expect(lines[0]?.measure).toEqual({ kind: 'units', count: 1, unitPrice: 7.49 });
  });

  it('lê o total quando ele vem sozinho na linha seguinte', () => {
    // é assim que a maioria dos portais quebra o bloco
    const lines = parseReceiptText(`
      CHOC NEUGEBAUER BR 80G AO LEITE (Código: 987 )
      Qtde.:2  UN: UN1  Vl. Unit.:   4,99   Vl. Total
      9,98
    `);

    expect(lines[0]?.measure).toEqual({ kind: 'units', count: 2, unitPrice: 4.99 });
    expect(lines[0]?.displayTotal).toBeCloseTo(9.98, 2);
  });

  it('reconhece item vendido por peso', () => {
    const lines = parseReceiptText(`
      COXAO DE FORA BOV BIFE kg (Código: 555 )
      Qtde.:0,435  UN: KG  Vl. Unit.:   54,90   Vl. Total 23,88
    `);

    expect(lines[0]?.measure).toEqual({ kind: 'weight', kilos: 0.435, pricePerKilo: 54.9 });
    expect(total(lines[0]!.measure)).toBeCloseTo(23.88, 2);
  });

  it('deduz o preço unitário quando o cupom só traz o total', () => {
    const lines = parseReceiptText(`
      PIZZA SADIA CALABRESA 460G
      Qtde.:2  Vl. Total 31,00
    `);

    expect(lines[0]?.measure).toEqual({ kind: 'units', count: 2, unitPrice: 15.5 });
  });

  it('ignora cabeçalhos e rodapés da nota', () => {
    const lines = parseReceiptText(`
      Consumidor: 000.000.000-00
      Chave de acesso
      1234 5678 9012
      ARROZ TIO JOAO 5KG (Código: 111 )
      Qtde.:1  UN: UN1  Vl. Unit.:   29,90   Vl. Total 29,90
      Total da nota 29,90
    `);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.name).toBe('ARROZ TIO JOAO 5KG');
  });

  it('descarta bloco sem preço nenhum', () => {
    expect(parseReceiptText('SO UM NOME SOLTO')).toEqual([]);
  });

  it('não quebra com texto vazio', () => {
    expect(parseReceiptText('')).toEqual([]);
    expect(parseReceiptText('   \n  \n ')).toEqual([]);
  });
});

describe('parseReceiptDiscount', () => {
  it('lê o desconto quando o valor vem na linha seguinte', () => {
    // é assim que o portal sai ao copiar o rodapé da nota
    const text = `
      ARROZ KIKA PARBO PC 5kg (Código: 2635 )
      Qtde.:1  UN: UN1  Vl. Unit.:   12,79   Vl. Total
      12,79
      Qtd. total de itens:
      108
      Valor total R$:
      738,68
      Descontos R$:
      14,30
      Valor a pagar R$:
      724,38
    `;

    expect(parseReceiptDiscount(text)).toBeCloseTo(14.3, 2);
  });

  it('lê o desconto na mesma linha do rótulo', () => {
    expect(parseReceiptDiscount('Descontos R$:\t14,30')).toBeCloseTo(14.3, 2);
    expect(parseReceiptDiscount('Desconto R$ 1.014,30')).toBeCloseTo(1014.3, 2);
  });

  it('devolve null quando a nota não traz a linha', () => {
    expect(parseReceiptDiscount('Valor a pagar R$:\n724,38')).toBeNull();
    expect(parseReceiptDiscount('')).toBeNull();
  });

  it('não confunde o desconto com os itens', () => {
    const text = `
      ARROZ KIKA PARBO PC 5kg (Código: 2635 )
      Qtde.:1  UN: UN1  Vl. Unit.:   12,79   Vl. Total
      12,79
      Descontos R$:
      14,30
    `;

    expect(parseReceiptText(text)).toHaveLength(1);
  });
});
