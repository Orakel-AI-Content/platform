# 0004 – Rota única com o mapa de páginas do site

- Status: aceito
- Data: 2026-09-30

## Decisão

- `src/pages/[...path].astro` atende todas as páginas. `siteRoutes(site)` monta, uma vez por site, o mapa caminho → `PageModel` com as rotas do core: home e paginação, conteúdos, taxonomias e autores com paginação (`PAGE_SIZE` 10), institucionais com texto, `/busca/` (com a flag `busca`).
- Estático: `getStaticPaths` enumera o mapa. SSR: o middleware consulta o mesmo mapa; caminho ausente é 404 com a mesma view.
- `404.astro` gera o `404.html` do Worker (`not_found_handling`).
- Listas só com artigos, do mais recente (empate pelo ID).

## Consequências

Rota nova: função no core + entrada em `siteRoutes`. Nenhuma página monta caminho com template string.
