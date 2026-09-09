import { beforeEach, describe, expect, it } from 'vitest';
import { loadState, saveState } from './local.js';
import { emptyState, type StoredState } from './schema.js';

const guardado = new Map<string, string>();

beforeEach(() => {
  guardado.clear();
  globalThis.localStorage = {
    getItem: (key: string) => guardado.get(key) ?? null,
    setItem: (key: string, value: string) => void guardado.set(key, value),
    removeItem: (key: string) => void guardado.delete(key),
    clear: () => guardado.clear(),
    key: () => null,
    length: 0,
  };
});

const ANTIGO = JSON.stringify({
  step: 3,
  planned: [{ id: 'p1', name: 'Bife', qty: 1, price: 23.88 }],
  bought: [{ id: 'b1', name: 'COXAO BOV BIFE kg', qty: 0.435, price: 54.9, isWeight: true }],
  overrides: { b1: 'p1' },
});

describe('primeira abertura depois da mudança de formato', () => {
  it('lê a compra que está salva no formato antigo', () => {
    guardado.set('conferelista_v1', ANTIGO);

    const state = loadState();

    expect(state.planned[0]?.name).toBe('Bife');
    expect(state.lines[0]?.measure).toEqual({ kind: 'weight', kilos: 0.435, pricePerKilo: 54.9 });
    expect(state.adjustments).toEqual({ b1: 'p1' });
  });

  it('não apaga a chave antiga ao gravar a nova', () => {
    // se a migração tiver defeito que só apareça no meio de uma compra,
    // a compra original continua lá
    guardado.set('conferelista_v1', ANTIGO);

    saveState(loadState());

    expect(guardado.has('conferelista_v1')).toBe(true);
    expect(guardado.get('conferelista_v1')).toBe(ANTIGO);
  });

  it('grava no formato novo', () => {
    guardado.set('conferelista_v1', ANTIGO);

    saveState(loadState());

    const gravado = JSON.parse(guardado.get('conferelista_v2') ?? '{}');
    expect(gravado.lines[0].measure).toEqual({ kind: 'weight', kilos: 0.435, pricePerKilo: 54.9 });
    expect(gravado.bought).toBeUndefined();
    expect(gravado.overrides).toBeUndefined();
  });
});

describe('uso normal', () => {
  it('a chave nova tem preferência sobre a antiga', () => {
    const atual: StoredState = {
      step: 1,
      planned: [{ id: 'p9', name: 'Café', quantity: 1, unitPrice: 15 }],
      lines: [],
      adjustments: {},
    };
    guardado.set('conferelista_v1', ANTIGO);
    guardado.set('conferelista_v2', JSON.stringify(atual));

    expect(loadState()).toEqual(atual);
  });

  it('começa vazio quando não há nada salvo', () => {
    expect(loadState()).toEqual(emptyState());
  });

  it('começa vazio em vez de quebrar quando o que está salvo está corrompido', () => {
    guardado.set('conferelista_v2', '{isso não é json');
    expect(loadState()).toEqual(emptyState());
  });
});
