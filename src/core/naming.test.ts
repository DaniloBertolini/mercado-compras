import { describe, expect, it } from 'vitest';
import { MATCH_THRESHOLD, matchScore, normalize, tokenize } from './naming.js';

describe('normalize', () => {
  it('remove acentos e caixa', () => {
    expect(normalize('  Ação Não-Láctea ')).toBe('acao nao-lactea');
  });
});

describe('tokenize', () => {
  it('descarta palavras curtas e conectores', () => {
    expect(tokenize('leite de coco em pó')).toEqual(['leite', 'coco']);
  });

  it('quebra em qualquer pontuação do cupom', () => {
    expect(tokenize('BISC MINUETO WAFER PC 81G CHOC/BAUN')).toEqual([
      'bisc', 'minueto', 'wafer', '81g', 'choc', 'baun',
    ]);
  });
});

describe('matchScore', () => {
  const score = (planned: string, receipt: string) => matchScore(tokenize(planned), tokenize(receipt));

  it('dá nota cheia para palavra inteira', () => {
    expect(score('chocolate', 'BISC CASAREDO PC 500G CHOCOLATE')).toBe(1);
  });

  it('dá nota menor para abreviação', () => {
    // "CHOC" é chocolate abreviado: conta, mas perde para a palavra inteira
    const abreviado = score('chocolate', 'CHOC NEUGEBAUER BR 80G AO LEITE');
    expect(abreviado).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(abreviado).toBeLessThan(1);
  });

  it('é essa diferença que separa a bolacha do chocolate', () => {
    const bolacha = 'BISC MINUETO WAFER PC 81G CHOC/BAUN';
    expect(score('minueto', bolacha)).toBeGreaterThan(score('chocolate', bolacha));
  });

  it('não se importa com a ordem das palavras', () => {
    expect(score('papel toalha', 'TOALHA PAPEL SCOTT 2UN')).toBe(1);
  });

  it('fica abaixo do limiar para produtos diferentes', () => {
    expect(score('guarana', 'ARROZ TIO JOAO 5KG')).toBeLessThan(MATCH_THRESHOLD);
  });

  it('vale zero quando não há o que comparar', () => {
    expect(matchScore([], ['arroz'])).toBe(0);
    expect(matchScore(['arroz'], [])).toBe(0);
  });
});
