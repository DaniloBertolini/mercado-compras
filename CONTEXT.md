# confereLISTA

Confere se o preço anunciado na gôndola foi o preço cobrado no caixa. O uso é
real e móvel: de pé no mercado, no celular, com uma mão.

## Language

### As duas listas

**Previsto**:
O que você viu anunciado na etiqueta ou promoção: produto, quantidade e preço.
Preço é sempre unitário.
_Avoid_: planejado, item planejado, lista de compras

**Linha do cupom**:
Uma linha do cupom fiscal. Não é um produto: uma única linha pode valer 12
unidades ou 0,435 kg.
_Avoid_: item pago, item comprado, produto

**Linha bruta**:
O que saiu do texto colado do portal da nota, antes de você confirmar quais
linhas entram. Vira Linha do cupom ao ser confirmada.
_Avoid_: item importado, bloco, preview

### A comparação

**Conferência**:
Um Previsto junto das Linhas do cupom que couberam nele. É a unidade que a tela
de comparação exibe.
_Avoid_: slot, match, par

**Correspondência**:
O julgamento de que uma Linha do cupom pertence a um Previsto. Nasce da
distribuição automática ou de um Ajuste.
_Avoid_: match

**Excedente**:
Linha do cupom que um Previsto reconheceu como sua, mas recusou por já ter
atingido a quantidade prevista. Diferente de uma compra fora da lista.
_Avoid_: sobra, leftover, item extra

**Ajuste**:
Decisão manual sua sobre a qual Previsto uma Linha do cupom pertence — ou de que
ela não pertence a nenhum. Vence sempre a distribuição automática, inclusive
furando a quantidade prevista.
_Avoid_: override, correção, reatribuição

### Medida

**Medida**:
Como uma Linha do cupom é quantificada. Tem duas formas que não se misturam:
**por unidade** (quantidade × preço unitário) e **por peso** (quilos × preço do
quilo). Confundir as duas é o que faz três bandejas de bife virarem "1,25 un".
_Avoid_: qty, quantidade solta, isWeight

**Backup**:
O estado inteiro do app serializado como texto, para atravessar do celular ao
PC. Os dados vivem só no aparelho: não há servidor nem conta.
_Avoid_: export, sync, sincronização
