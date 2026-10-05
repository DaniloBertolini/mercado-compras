import { describe, expect, it } from 'vitest';
import { backupFileName, buildBackup, parseBackup } from './backup.js';
import type { StoredState } from './schema.js';

const compra: StoredState = {
  step: 3,
  planned: [{ id: 'p1', name: 'Bife', quantity: 1, unitPrice: 23.88 }],
  lines: [
    {
      id: 'b1',
      name: 'COXAO DE FORA BOV BIFE kg',
      measure: { kind: 'weight', kilos: 0.435, pricePerKilo: 54.9 },
    },
  ],
  adjustments: { b1: 'p1' },
  discount: 1.3,
  discountAllocations: { p1: 1.3 },
};

describe('ida e volta', () => {
  it('o que sai do celular chega igual no PC', () => {
    expect(parseBackup(buildBackup(compra))).toEqual(compra);
  });

  it('cabe numa linha só, para colar no WhatsApp', () => {
    expect(buildBackup(compra)).not.toContain('\n');
  });

  it('o nome do arquivo leva a data da exportação', () => {
    expect(backupFileName(new Date('2026-09-08T15:00:00Z'))).toBe('conferelista-2026-09-08.json');
  });
});

describe('backups de versões anteriores', () => {
  it('aceita o formato antigo, que pode estar parado num WhatsApp há meses', () => {
    const antigo = JSON.stringify({
      app: 'conferelista',
      version: 1,
      exportedAt: '2026-09-06T12:00:00.000Z',
      state: {
        step: 3,
        planned: [{ id: 'p1', name: 'Bife', qty: 1, price: 23.88 }],
        bought: [{ id: 'b1', name: 'COXAO DE FORA BOV BIFE kg', qty: 0.435, price: 54.9, isWeight: true }],
        overrides: { b1: 'p1' },
      },
    });

    // de antes do desconto existir: a compra chega inteira, sem desconto
    expect(parseBackup(antigo)).toEqual({ ...compra, discount: 0, discountAllocations: {} });
  });

  it('aceita o estado cru, sem os metadados', () => {
    const cru = JSON.stringify(compra);
    expect(parseBackup(cru)).toEqual(compra);
  });
});

describe('mensagens de erro', () => {
  it('avisa quando não colaram nada', () => {
    expect(() => parseBackup('')).toThrow(/Cole o código/);
    expect(() => parseBackup('   ')).toThrow(/Cole o código/);
  });

  it('avisa quando o texto foi truncado no caminho', () => {
    // WhatsApp e e-mail cortam mensagem longa: o JSON chega pela metade
    const cortado = buildBackup(compra).slice(0, 60);
    expect(() => parseBackup(cortado)).toThrow(/Código inválido/);
  });

  it('avisa quando é JSON válido mas não é um backup', () => {
    expect(() => parseBackup('{"foo":1}')).toThrow(/nenhuma lista/);
  });

  it('avisa quando as listas vieram vazias', () => {
    expect(() => parseBackup('{"planned":[],"lines":[]}')).toThrow(/listas estão vazias/);
  });

  it('avisa quando sobrou lista nenhuma depois da limpeza', () => {
    // itens existem, mas nenhum é aproveitável
    expect(() => parseBackup('{"planned":[{"name":""}],"lines":[{"name":"x"}]}')).toThrow(
      /listas estão vazias/,
    );
  });
});
