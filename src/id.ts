/**
 * Identidade própria de cada item.
 *
 * Os Ajustes apontam para itens, não para posições numa lista: sem id, apagar
 * um item faria todos os ajustes seguintes escorregarem para o item errado,
 * silenciosamente.
 */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
