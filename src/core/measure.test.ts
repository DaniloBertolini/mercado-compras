import { describe, expect, it } from 'vitest';
import { total, units } from './measure.js';

describe('Medida por unidade', () => {
  it('conta as unidades e multiplica pelo preço unitário', () => {
    const measure = { kind: 'units', count: 12, unitPrice: 2.5 } as const;
    expect(units(measure)).toBe(12);
    expect(total(measure)).toBeCloseTo(30, 2);
  });
});

describe('Medida por peso', () => {
  // 0,435 kg de coxão a R$ 54,90 o quilo dá os R$ 23,88 da etiqueta.
  const bandeja = { kind: 'weight', kilos: 0.435, pricePerKilo: 54.9 } as const;

  it('multiplica quilos pelo preço do quilo', () => {
    expect(total(bandeja)).toBeCloseTo(23.88, 2);
  });

  it('conta como uma unidade, não como 0,435', () => {
    // uma bandeja é uma bandeja: sem isso, três bandejas somariam "1,25 un"
    expect(units(bandeja)).toBe(1);
  });
});
