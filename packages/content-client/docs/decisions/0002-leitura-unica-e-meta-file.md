# 0002 – Uma leitura do snapshot por build, metaFile para o render, sem leitura ao vivo por ora

- Status: aceito
- Data: 2026-09-29

## Contexto

O snapshot alimenta várias coleções do Content Layer e o `result.json` do render do
site-builder precisa dos `pendingChangeIds` do `header` — mas o loader roda dentro do
`astro build`, não no render.

## Decisão

- `snapshotLoaders({ baseUrl, site, token, metaFile })` devolve um loader por coleção
  (`config`, `authors`, `taxonomies`, `menus`, `media`, `redirects`, `contents`), todos
  sobre a **mesma** leitura, memorizada no processo.
- Terminada a leitura, grava `metaFile` com `{ header, end }`. O render passa um caminho
  absoluto pela configuração de conteúdo do blog.
- Os loaders não declaram `schema` do Astro: a validação é a do `content-model`; o blog tipa
  as entradas com os tipos dele. Erro de leitura vira `SnapshotReadError` com `kind`.
- Leitura ao vivo (visualização): fora desta geração. Entra num PR com as rotas `config`,
  `routes` e `listing` do backoffice, com o formato das respostas no `content-model`.

## Alternativas consideradas

- O render ler o snapshot de novo para o header: duas leituras podem ver estados diferentes.
- Header numa coleção exportada por integração do Astro: mais acoplado ao Astro.
- Cliente de visualização antes das rotas: contrato sem produtor nem consumidor.

## Consequências

Verificado num `astro build` real (Astro 7.3.5): uma requisição para duas coleções, página
gerada e `metaFile` com os `pendingChangeIds`.
