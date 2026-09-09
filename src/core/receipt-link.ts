/**
 * O que vem dentro do QR code da nota.
 *
 * O conteúdo de um QR é texto livre: quem imprime decide o que colocar. Como o
 * app abre esse endereço numa aba nova, ele precisa ser conferido antes — um QR
 * pode carregar `javascript:` ou qualquer outro esquema, e mirar a câmera não
 * deveria ser suficiente para executar algo.
 */
export function parseReceiptLink(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null; // QR de outra coisa qualquer, não de uma nota
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  return url.toString();
}
