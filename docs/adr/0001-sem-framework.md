# Sem framework de UI

O app é construído com TypeScript e DOM direto, sem React, Vue ou similar.

A escolha surpreende porque o app já faz o que um framework faria: mantém um
estado central e redesenha a tela inteira a cada mudança (`renderAll()`). A
diferença é que, com três telas e um estado pequeno, a reatividade automática
resolveria um problema que não temos — enquanto o problema que temos era outro:
as regras de negócio (distribuição das linhas do cupom, medida por peso ou
unidade, ajustes manuais) estavam soldadas ao `document`, e testá-las exigia
forjar um DOM falso.

Extrair essas regras para um núcleo puro resolve isso e é pré-requisito de
qualquer migração futura: se um dia React fizer sentido, a camada de view é a
parte descartável. Adotá-lo agora obrigaria a mexer nas regras e na tela ao
mesmo tempo, exatamente o que a reestruturação queria evitar.

## Consequências

A camada de view continua usando `innerHTML` com template strings, o que exige
disciplina: todo dado vindo do usuário ou do cupom passa por `escapeHtml` antes
de ser interpolado. Um framework daria esse escape de graça; aqui é manual.
