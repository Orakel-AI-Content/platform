# 0022 – Data automática de publicação resolvida na exportação

- Status: aceito
- Data: 2026-11-12

## Contexto

O `publishedAt` de um conteúdo fica nos dados da versão (`content_versions.data`). A geração e
a criação o preenchem com o momento em que a versão nasce. A Story
Orakel-AI-Content/workspace#89 (AC4) pede outra data no artigo publicado: o momento em que ele
foi ao ar, a menos que uma pessoa tenha escolhido outra. Os dados da versão são imutáveis
(ADR 0015), então a data não pode ser reescrita quando a versão é publicada. A exportação
precisa saber se a data da versão é automática ou foi definida, e de onde tirar o momento da
publicação.

## Decisão

- **Marcador na versão.** `content_versions.published_at_auto` (boolean, padrão `true`) fica
  fora de `data`.
  - A versão criada pelo editor ou pela geração nasce com ele ligado.
  - Um salvamento (`updateContent`, também na correção do revisor) herda o valor da versão
    anterior. Se `publishedAt` mudou, grava `false`. A comparação é por instante: o mesmo
    horário com outro offset não conta como troca.
- **A importação grava `false`.** A data do acervo é a data real em que o artigo foi ao ar.
  Com o marcador ligado, a primeira republicação pelo Backoffice viraria a "primeira
  publicação" e mudaria a data.
- **Resolução na exportação.** O snapshot lê `min(publications.published_at)` do conteúdo. Com
  o marcador ligado e alguma publicação, o `toContent` usa essa data como `publishedAt`. Nos
  outros casos, a data da versão fica.
  - No agendado, a linha nasce com o horário marcado, e o cancelamento a remove: a data é a do
    horário marcado.
  - Uma versão nova de um artigo já publicado mantém a data da primeira publicação. A mudança
    aparece no `updatedAt`.
- **Migração só aditiva.** As versões existentes ficam com o marcador ligado, sem backfill.

## Alternativas consideradas

- Reescrever `data.publishedAt` ao publicar: quebraria a imutabilidade dos dados da versão
  (ADR 0015).
- Coluna `first_published_at` em `contents`: duplicaria um dado que `publications` já tem, e o
  cancelamento do agendamento teria de mantê-la.
- Marcador ligado também na importação: a data do acervo saltaria para o dia da republicação.
- Backfill do marcador nos conteúdos sem publicação: um rascunho gerado, que também não tem
  publicação, ficaria com a data da geração congelada.

## Consequências

- O `publishedAt` exportado pode diferir de `data.publishedAt`. Quem lê a versão direto do
  banco tem de aplicar a mesma regra.
- Conteúdos importados antes da migração ficam com o marcador ligado até um novo seed ou uma
  nova importação. Hoje só existe o ambiente local, sem acervo de produção a preservar.
- A visualização (`preview`) aplica a mesma regra. Um agendado mostra o horário marcado antes
  de ir ao ar.
