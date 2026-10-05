# confereLISTA

Confere se o preço anunciado na gôndola foi o preço cobrado no caixa. O uso é
real e móvel: de pé no mercado, no celular, com uma mão.

O código usa identificadores em inglês; cada termo abaixo traz o nome que ele
tem no código. Os `_Avoid_` valem para a conversa em português — são as palavras
que confundem, não sinônimos proibidos em inglês.

## Language

### As duas listas

**Previsto** (`PlannedItem`):
O que você viu anunciado na etiqueta ou promoção: produto, quantidade e preço.
Preço é sempre unitário.
_Avoid_: planejado, item planejado, lista de compras

**Preço só no caixa** (`unitPrice: null`):
Previsto cujo valor não existe na gôndola porque sai da balança: linguiça,
fruta, carne. Não é preço esquecido — é informação que ainda não existe, então
o item fica fora de qualquer conta de divergência.
_Avoid_: sem preço, preço zero, item a definir

**Linha do cupom** (`ReceiptLine`):
Uma linha do cupom fiscal. Não é um produto: uma única linha pode valer 12
unidades ou 0,435 kg.
_Avoid_: item pago, item comprado, produto

**Linha bruta** (`RawLine`):
O que saiu do texto colado do portal da nota, antes de você confirmar quais
linhas entram. Vira Linha do cupom ao ser confirmada.
_Avoid_: item importado, bloco, preview

**Desconto do cupom** (`discount`):
O total de descontos que a nota informa só no rodapé ("Descontos R$"). O cupom
de papel mostra cada desconto embaixo do seu item, mas o portal lista os itens
pelo preço cheio e não diz de qual deles o desconto saiu. Abate do total pago,
nunca do preço de uma Linha do cupom.
_Avoid_: desconto do item, promoção

**Desconto atribuído** (`discountAllocations`):
A parte do Desconto do cupom que você ligou a um Previsto, olhando o cupom de
papel. Sai da diferença daquele item, então um "cobrado a mais" que era só
desconto vira conferido. A soma nunca passa do Desconto do cupom: sem esse teto,
atribuir desconto apagaria qualquer cobrança errada.
_Avoid_: abatimento, crédito

### A comparação

**Conferência** (`Check`):
Um Previsto junto das Linhas do cupom que couberam nele. É a unidade que a tela
de comparação exibe.
_Avoid_: slot, par

**Correspondência** (`Match`):
O julgamento de que uma Linha do cupom pertence a um Previsto. Nasce da
distribuição automática ou de um Ajuste.

**Excedente** (`surplusOf`):
Linha do cupom que um Previsto reconheceu como sua, mas recusou por já ter
atingido a quantidade prevista.
_Avoid_: sobra, item extra

**Fora da lista** (`surplusOf: null`):
Linha do cupom que nenhum Previsto reclamou. Uma compra que não estava na lista
— diferente de um Excedente.
_Avoid_: sobra, item extra

**Ajuste** (`Adjustment`):
Decisão manual sua sobre a qual Previsto uma Linha do cupom pertence — ou de que
ela não pertence a nenhum. Vence sempre a distribuição automática, inclusive
furando a quantidade prevista.
_Avoid_: override, correção, reatribuição

### Medida

**Medida** (`Measure`):
Como uma Linha do cupom é quantificada. Tem duas formas que não se misturam:
**por unidade** (quantidade × preço unitário) e **por peso** (quilos × preço do
quilo). Confundir as duas é o que faz três bandejas de bife virarem "1,25 un".
_Avoid_: qty, quantidade solta, isWeight

**Backup**:
O estado inteiro do app serializado como texto, para atravessar do celular ao
PC. Os dados vivem só no aparelho: não há servidor nem conta.
_Avoid_: export, sync, sincronização
