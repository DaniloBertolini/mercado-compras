import { describe, expect, it } from 'vitest';
import { emptyState, normalizeState } from './schema.js';

/**
 * O formato antigo abaixo é uma cópia fiel do que o app gravava antes da
 * Medida: uma compra real, salva no celular. Se estes testes falharem, alguém
 * que abrir o app depois de meses perde a lista.
 */
const LEGADO = {
  step: 3,
  planned: [
    { id: 'p1', name: 'Esmalte', qty: 1, price: 7.49 },
    { id: 'p2', name: 'Bife', qty: 2, price: 23.88 },
  ],
  bought: [
    { id: 'b1', name: 'ESMALTE RISQUE BL 8ML CR ASTRAL', qty: 1, price: 7.49 },
    { id: 'b2', name: 'COXAO DE FORA BOV BIFE kg', qty: 0.435, price: 54.9, isWeight: true },
  ],
  overrides: { b1: 'p1' },
};

describe('formato antigo', () => {
  it('vira Medida por unidade', () => {
    const state = normalizeState(LEGADO);
    expect(state.lines[0]?.measure).toEqual({ kind: 'units', count: 1, unitPrice: 7.49 });
  });

  it('vira Medida por peso, com o preço do quilo no lugar certo', () => {
    const state = normalizeState(LEGADO);
    expect(state.lines[1]?.measure).toEqual({ kind: 'weight', kilos: 0.435, pricePerKilo: 54.9 });
  });

  it('renomeia bought para lines e overrides para adjustments', () => {
    const state = normalizeState(LEGADO);
    expect(state.lines).toHaveLength(2);
    expect(state.adjustments).toEqual({ b1: 'p1' });
  });

  it('traduz qty/price do Previsto', () => {
    const state = normalizeState(LEGADO);
    expect(state.planned[1]).toEqual({ id: 'p2', name: 'Bife', quantity: 2, unitPrice: 23.88 });
  });

  it('preserva o passo em que a compra parou', () => {
    expect(normalizeState(LEGADO).step).toBe(3);
  });

  it('assume uma unidade quando a linha foi digitada à mão, sem qty', () => {
    // é o que a tela 2 grava quando você digita nome e preço
    const state = normalizeState({ bought: [{ id: 'b9', name: 'PAO FRANCES', price: 12.5 }] });
    expect(state.lines[0]?.measure).toEqual({ kind: 'units', count: 1, unitPrice: 12.5 });
  });
});

describe('formato novo', () => {
  it('passa intacto', () => {
    const novo = {
      step: 2,
      planned: [{ id: 'p1', name: 'Arroz', quantity: 1, unitPrice: 29.9 }],
      lines: [
        { id: 'b1', name: 'ARROZ TIO JOAO 5KG', measure: { kind: 'units', count: 1, unitPrice: 29.9 } },
      ],
      adjustments: { b1: 'p1' },
    };
    expect(normalizeState(novo)).toEqual(novo);
  });
});

describe('entrada estragada', () => {
  it('devolve estado vazio para lixo', () => {
    expect(normalizeState(null)).toEqual(emptyState());
    expect(normalizeState('texto solto')).toEqual(emptyState());
    expect(normalizeState(42)).toEqual(emptyState());
  });

  it('descarta item sem nome ou sem preço em vez de exibir R$ NaN', () => {
    const state = normalizeState({
      planned: [
        { name: '', qty: 1, price: 5 },
        { name: 'Arroz', qty: 1, price: 'abc' },
        { name: 'Feijão', qty: 1, price: 8.9 },
        'nem objeto é',
      ],
    });

    expect(state.planned).toHaveLength(1);
    expect(state.planned[0]?.name).toBe('Feijão');
  });

  it('gera id para item salvo antes de existirem ids', () => {
    const state = normalizeState({ planned: [{ name: 'Cafe', qty: 1, price: 15 }] });
    expect(state.planned[0]?.id).toBeTruthy();
  });

  it('joga fora Ajuste que aponta para item apagado', () => {
    const state = normalizeState({
      planned: [{ id: 'p1', name: 'Arroz', qty: 1, price: 20 }],
      bought: [{ id: 'b1', name: 'ARROZ TIO JOAO', qty: 1, price: 20 }],
      adjustments: {
        b1: 'p-que-nao-existe', // Previsto apagado
        'b-apagada': 'p1', // Linha apagada
        b2: null, // Linha que nunca existiu
      },
    });

    expect(state.adjustments).toEqual({});
  });

  it('mantém o Ajuste que marca Fora da lista', () => {
    const state = normalizeState({
      planned: [{ id: 'p1', name: 'Chocolate', qty: 1, price: 4.99 }],
      bought: [{ id: 'b1', name: 'BISC CASAREDO PC 500G CHOCOLATE', qty: 1, price: 7.49 }],
      adjustments: { b1: null },
    });

    expect(state.adjustments).toEqual({ b1: null });
  });

  it('corrige passo inválido para o começo', () => {
    expect(normalizeState({ step: 9 }).step).toBe(1);
    expect(normalizeState({ step: 'três' }).step).toBe(1);
  });
});

describe('item sem preco anunciado', () => {
  it('sobrevive a ida e volta', () => {
    const state = normalizeState({
      planned: [{ id: 'p1', name: 'Linguica', quantity: 1, unitPrice: null }],
    });

    expect(state.planned[0]?.unitPrice).toBeNull();
  });

  it('nao confunde preco ilegivel com preco no caixa', () => {
    // null e intencional; lixo continua sendo descartado
    const state = normalizeState({
      planned: [
        { name: 'Linguica', unitPrice: null },
        { name: 'Arroz', unitPrice: 'abc' },
        { name: 'Feijao', unitPrice: 8.9 },
      ],
    });

    expect(state.planned.map((item) => item.name)).toEqual(['Linguica', 'Feijao']);
  });
});
