# confereLISTA

Confere se o preço anunciado na gôndola foi o preço cobrado no caixa.

No ar em **https://danilobertolini.github.io/mercado-compras/**

O vocabulário do domínio está em [CONTEXT.md](./CONTEXT.md) — vale ler antes de
mexer no código, porque os nomes ali são os nomes usados nos tipos e funções.

## Onde fica o quê

```
src/
├── core/      regras de negócio, sem DOM nem localStorage — é o que os testes cobrem
├── storage/   o estado salvo, a migração de formatos antigos e o backup
├── ui/        as três telas, o painel de backup e o CSS de cada área
└── main.ts    monta as peças e liga o store à tela
```

A separação existe para uma coisa concreta: distribuir as linhas do cupom entre
os itens previstos é a parte difícil do app, e ela precisa ser testável sem
navegador. Tudo em `core/` recebe dados e devolve dados.

## Rodar

```bash
npm install
npm run dev        # abre em localhost com recarga automática
```

## Antes de subir

```bash
npm run typecheck  # tipos
npm test           # regras de negócio
npm run build      # gera dist/
```

Os três rodam sozinhos no CI. Se qualquer um falhar, **nada é publicado** e o
site continua na última versão que passou.

## Publicação

`git push` na `main` dispara [a Action](.github/workflows/deploy.yml), que
verifica, builda e publica `dist/`. Não existe passo manual.

A origem do GitHub Pages está configurada como **GitHub Actions** (não como
branch): o que vai ao ar é o resultado do build, não os arquivos do repositório.

## Onde ficam os dados

No `localStorage` do aparelho. Não há servidor nem conta — o app é usado no
celular, dentro do mercado, e precisa funcionar sem depender de rede.

Para levar uma compra do celular ao PC, use o bloco **backup** no rodapé:
exporta o estado como texto (ou arquivo) e importa no outro aparelho.

## Decisões

Registradas em [docs/adr/](./docs/adr/).
