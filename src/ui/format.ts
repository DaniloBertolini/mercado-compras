import type { Measure } from '../core/measure.js';

export function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "x8" ou "0,435 kg", conforme a Medida. */
export function measureLabel(measure: Measure): string {
  return measure.kind === 'weight'
    ? `${measure.kilos.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
    : `x${Math.round(measure.count)}`;
}

/**
 * A tela é montada com template strings, então todo texto vindo de você ou do
 * cupom passa por aqui antes de ser interpolado. Um framework daria isso de
 * graça; sem framework, é disciplina (ver docs/adr/0001).
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape para dentro de um atributo, como `value="..."`.
 *
 * `escapeHtml` não serve aqui: ele não escapa aspas duplas, porque dentro do
 * corpo do HTML elas são inofensivas. Num atributo, um produto chamado
 * `refri 2" litros` fecharia o `value` e o resto viraria marcação.
 */
export function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
