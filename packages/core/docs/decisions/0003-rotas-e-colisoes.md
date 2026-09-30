# 0003 – O core é a fonte única das rotas; colisões são falha permanente

- Status: aceito
- Data: 2026-09-30

## Decisão

- `homePath`, `contentPath`, `taxonomyPath`, `authorPath`, `INSTITUTIONAL_PAGES`, `SEARCH_PATH`: toda rota termina com `/`; a página 1 não tem sufixo; as seguintes usam `/pagina/<n>/`. Artigos e páginas ficam em `/<slug>/`; taxonomias em `/categoria/`, `/tag/`, `/serie/`; autores em `/autor/`.
- Institucionais (`/sobre/`, `/contato/`, `/termos/`, `/privacidade/`, `/politica-editorial/`) vêm do texto da configuração e só existem com texto definido.
- `routeConflicts` aponta: slug de conteúdo em `RESERVED_SLUGS` (segmentos de rota, institucionais, `busca`, `404`, `pagefind`, `fonts`) e redirect cuja origem é uma página viva (com ou sem barra final). Duplicidade de slug já é verificada pelo `content-model`.
- Uma URL tem uma fonte só: página de conteúdo com slug institucional é erro, não substituição. Por isso a fixture `exemplo-a` passou a página `sobre` para `quem-somos`.

## Alternativas consideradas

- Blog monta as rotas: o core receberia caminhos prontos e não testaria a coerência.
- Página vence a institucional (ou o contrário): uma das fontes sumiria em silêncio.

## Consequências

Fechar a tabela de rotas na L2 é mudar `routes.ts`; links, canonical, sitemap e manifesto acompanham. O backoffice deve recusar slugs reservados ao salvar (pendência).
