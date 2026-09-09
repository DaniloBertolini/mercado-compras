/**
 * Busca um elemento que o HTML garante existir.
 *
 * Falha alto e cedo se não existir: um id trocado no HTML vira erro no primeiro
 * carregamento, em vez de um `null` que só estoura quando você toca no botão —
 * possivelmente no meio de uma compra.
 */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não existe no HTML`);
  return element as T;
}

/** Uma parte da tela que sabe se redesenhar a partir do estado. */
export interface Screen {
  render(): void;
}
