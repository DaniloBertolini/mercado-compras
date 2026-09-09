# Medida como união discriminada, e o formato antigo aceito para sempre

Uma Linha do cupom é quantificada de duas maneiras que não se misturam: por
unidade (quantidade × preço unitário) ou por peso (quilos × preço do quilo). O
formato anterior guardava isso como três campos soltos — `qty`, `price` e
`isWeight` — em que `price` mudava de significado conforme a flag. Nada impedia
somar 0,435 kg com 8 unidades, nem exibir o preço do quilo como se fosse o do
produto: foi o que fez três bandejas de bife aparecerem como "1,25 un" custando
"R$ 54,90". Modelar como união discriminada transforma esses erros em código que
não compila.

O custo é que o formato dos dados salvos mudou, e os dados deste app só existem
no aparelho de quem usa — não há servidor de onde recuperá-los. Por isso a
conversão do formato antigo é **permanente**, não uma janela de migração: um
Backup é um texto que pode ficar meses parado numa conversa de WhatsApp, e
recusá-lo em janeiro porque foi exportado em setembro significaria perder a
compra. Toda entrada — `localStorage`, Backup colado, arquivo — passa por
`normalizeState`, que aceita os dois formatos.

## Consequências

O `localStorage` usa a chave `conferelista_v2`, e a `conferelista_v1` **nunca é
apagada**. Se a migração tiver algum defeito que só apareça no meio de uma
compra real, a compra original continua intacta na chave antiga. O custo é
alguns KB duplicados por aparelho, o que é irrelevante perto de perder a lista
no caixa.

Item que não dá para entender é descartado em vez de virar `R$ NaN` na tela.
Isso significa que uma entrada corrompida some silenciosamente — preferimos
perder uma linha a exibir um total errado durante a conferência.
