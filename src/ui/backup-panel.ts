import { backupFileName, buildBackup, parseBackup } from '../storage/backup.js';
import type { StoredState } from '../storage/schema.js';
import type { Store } from '../store.js';
import { byId } from './dom.js';

/**
 * Bloco de Backup do rodapé — o único caminho entre o celular e o PC.
 *
 * Fica fora das telas de propósito: os dados vivem só no aparelho, e você pode
 * precisar exportar de qualquer passo da compra.
 */
export function mountBackupPanel(store: Store): void {
  const textEl = byId<HTMLTextAreaElement>('backup-text');
  const statusEl = byId('backup-status');
  const fileEl = byId<HTMLInputElement>('backup-file');
  const btnCopy = byId<HTMLButtonElement>('btn-copy-backup');
  const btnDownload = byId<HTMLButtonElement>('btn-download-backup');
  const btnImport = byId<HTMLButtonElement>('btn-import-text');

  function status(message: string, kind?: 'ok' | 'bad'): void {
    statusEl.textContent = message;
    statusEl.className = `backup-status${kind ? ` ${kind}` : ''}`;
  }

  /**
   * `navigator.clipboard` não existe fora de https, então o plano B é deixar o
   * texto selecionado para você copiar à mão.
   */
  async function copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return selectFallback();
      }
    }
    return selectFallback();
  }

  function selectFallback(): boolean {
    textEl.focus();
    textEl.setSelectionRange(0, textEl.value.length);
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }

  function applyImported(imported: StoredState): boolean {
    const current = store.get();
    const hasData = current.planned.length > 0 || current.lines.length > 0;
    const resumo = `${imported.planned.length} item(ns) planejado(s) e ${imported.lines.length} pago(s)`;

    const aviso = hasData
      ? `Importar ${resumo}?\n\nIsto SUBSTITUI a lista que já está neste aparelho.`
      : `Importar ${resumo}?`;

    if (!confirm(aviso)) return false;

    store.replace(imported);
    return true;
  }

  function importFrom(text: string, origem?: string): void {
    try {
      if (applyImported(parseBackup(text))) {
        textEl.value = '';
        status(origem ? `Listas importadas de ${origem}.` : 'Listas importadas.', 'ok');
      }
    } catch (error) {
      status(error instanceof Error ? error.message : 'Não consegui ler esse código.', 'bad');
    }
  }

  btnCopy.addEventListener('click', () => {
    const text = buildBackup(store.get());
    textEl.value = text;

    void copyToClipboard(text).then((copied) => {
      status(
        copied
          ? 'Código copiado — cole no outro aparelho e toque em importar.'
          : 'O texto está selecionado aí em cima: copie manualmente.',
        copied ? 'ok' : 'bad',
      );
    });
  });

  btnDownload.addEventListener('click', () => {
    const blob = new Blob([buildBackup(store.get())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName();
    link.click();
    URL.revokeObjectURL(url);

    status('Arquivo gerado — mande para o outro aparelho e use "abrir arquivo".', 'ok');
  });

  btnImport.addEventListener('click', () => {
    importFrom(textEl.value);
  });

  fileEl.addEventListener('change', () => {
    const file = fileEl.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      importFrom(String(reader.result ?? ''), file.name);
      fileEl.value = '';
    };
    reader.onerror = () => {
      status('Não consegui ler o arquivo.', 'bad');
      fileEl.value = '';
    };
    reader.readAsText(file);
  });
}
