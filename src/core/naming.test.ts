import { describe, expect, it } from 'vitest';
import { MATCH_THRESHOLD, matchEvidence, matchScore, normalize, tokenize } from './naming.js';

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

describe('matchEvidence', () => {
  const evidencia = (previsto: string, cupom: string) =>
    matchEvidence(tokenize(previsto), tokenize(cupom));

  it('vale mais quando a palavra abre o nome do cupom', () => {
    // no leite condensado, "leite" e o produto; no chocolate, e o sabor
    expect(evidencia('leite', 'LEITE COND TIROL TP 395G')).toBeGreaterThan(
      evidencia('leite', 'CHOC NEUGEBAUER BR 80G AO LEITE'),
    );
  });

  it('premia o previsto mais especifico', () => {
    // e o inverso do que a media faz: la, "Leite" ganhava de "Leite condensado"
    const lata = 'LEITE COND TIROL TP 395G';
    expect(evidencia('leite condensado', lata)).toBeGreaterThan(evidencia('leite', lata));
  });

  it('deixa o chocolate ganhar do leite na barra de chocolate', () => {
    const barra = 'CHOC NEUGEBAUER BR 80G AO LEITE';
    expect(evidencia('chocolate', barra)).toBeGreaterThan(evidencia('leite', barra));
  });

  it('continua reconhecendo abreviacao no comeco do nome', () => {
    expect(evidencia('desodorante', 'DESOD AER REXONA 150ML')).toBeGreaterThan(0);
  });

  it('vale zero quando nao ha nada em comum', () => {
    expect(evidencia('guarana', 'ARROZ TIO JOAO 5KG')).toBe(0);
  });
});
