import { normalizeState, type StoredState } from './schema.js';

/**
 * Backup — o estado inteiro como texto, para atravessar do celular ao PC.
 *
 * Os dados vivem só no aparelho, então este é o único caminho entre eles. É
 * JSON numa linha só, de propósito: cabe numa mensagem de WhatsApp para você
 * mesmo, sem precisar anexar arquivo.
 */
const BACKUP_VERSION = 2;

export function buildBackup(state: StoredState, now: Date = new Date()): string {
  return JSON.stringify({
    app: 'conferelista',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    state,
  });
}

/** Nome do arquivo quando você prefere baixar em vez de copiar. */
export function backupFileName(now: Date = new Date()): string {
  return `conferelista-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Lê um Backup vindo de qualquer versão do app.
 *
 * Lança `Error` com uma mensagem escrita para você ler no meio do mercado, não
 * para um log: ela aparece direto na tela.
 */
export function parseBackup(text: string): StoredState {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('Cole o código exportado antes de importar.');

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Código inválido — copie o texto inteiro, do "{" até o "}" final.');
  }

  // Backup traz o estado embrulhado em metadados; aceita também o estado cru,
  // que é o que sai se você copiar direto do DevTools.
  const wrapped = typeof data === 'object' && data !== null && 'state' in data
    ? (data as { state: unknown }).state
    : data;

  const hasLists =
    typeof wrapped === 'object' &&
    wrapped !== null &&
    ('planned' in wrapped || 'lines' in wrapped || 'bought' in wrapped);

  if (!hasLists) throw new Error('Não encontrei nenhuma lista nesse código.');

  const state = normalizeState(wrapped);

  if (state.planned.length === 0 && state.lines.length === 0) {
    throw new Error('O código foi lido, mas as duas listas estão vazias.');
  }

  return state;
}
