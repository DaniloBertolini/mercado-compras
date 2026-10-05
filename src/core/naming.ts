/**
 * Comparação de nomes entre o que você escreveu e o que o cupom imprimiu.
 *
 * O cupom abrevia ("DESOD" por "desodorante"), troca a ordem das palavras
 * ("TOALHA PAPEL" por "papel toalha") e enfia peso, marca e volume no meio. Por
 * isso a comparação é palavra a palavra, e não do nome inteiro.
 */

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'para', 'por', 'em', 'no', 'na', 'e', 'ou',
]);

const TOKEN_MIN_LEN = 3;

/**
 * Palavra abreviada vale menos que palavra inteira. Sem esse desnível,
 * "BISC MINUETO WAFER CHOC/BAUN" disputaria a palavra "chocolate" de igual para
 * igual com o chocolate de verdade — e às vezes ganharia, por vir antes.
 */
const PREFIX_WEIGHT = 0.6;

/** A partir de quanto duas palavras são consideradas o mesmo produto. */
export const MATCH_THRESHOLD = 0.6;

/**
 * Palavra no começo do nome do cupom vale mais que no fim.
 *
 * O cupom escreve o produto primeiro e os qualificadores depois: "LEITE COND
 * TIROL", "CHOC NEUGEBAUER BR 80G AO LEITE". Sem esse desnível, o previsto
 * "Leite" casa com o chocolate tão bem quanto com o leite condensado — porque a
 * palavra "leite" está inteira nos dois, só que num deles ela é o produto e no
 * outro é o sabor.
 */
const POSITION_DECAY = 0.5;

function positionWeight(index: number): number {
  return 1 / (1 + POSITION_DECAY * index);
}

export function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= TOKEN_MIN_LEN && !STOPWORDS.has(token));
}

function tokenScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return PREFIX_WEIGHT;
  return 0;
}

/**
 * Média, entre as palavras do nome previsto, do quanto cada uma encontrou
 * correspondente no nome do cupom.
 *
 * Responde "esta linha *pode* ser este item?" — é o filtro de entrada. Quem
 * decide de quem a linha é, quando mais de um item a reivindica, é
 * `matchEvidence`.
 */
export function matchScore(plannedTokens: readonly string[], receiptTokens: readonly string[]): number {
  if (plannedTokens.length === 0 || receiptTokens.length === 0) return 0;

  const sum = plannedTokens.reduce((acc, plannedToken) => {
    const best = receiptTokens.reduce(
      (max, receiptToken) => Math.max(max, tokenScore(plannedToken, receiptToken)),
      0,
    );
    return acc + best;
  }, 0);

  return sum / plannedTokens.length;
}

/**
 * Quanta evidência existe de que esta linha é deste item — somada, não
 * promediada, e com peso maior para palavras no começo do nome do cupom.
 *
 * A média não serve para desempatar porque castiga a especificidade: "Leite
 * condensado" acha as duas palavras em "LEITE COND TIROL" e ainda assim tira
 * 0,8, enquanto "Leite" tira 1,0 por achar a única que tem. Somando, o previsto
 * mais específico acumula mais evidência e ganha a linha — que é o que se
 * espera de quem descreve melhor o produto.
 */
export function matchEvidence(
  plannedTokens: readonly string[],
  receiptTokens: readonly string[],
): number {
  return plannedTokens.reduce((acc, plannedToken) => {
    const best = receiptTokens.reduce(
      (max, receiptToken, index) =>
        Math.max(max, tokenScore(plannedToken, receiptToken) * positionWeight(index)),
      0,
    );
    return acc + best;
  }, 0);
}
