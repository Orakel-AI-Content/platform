# 0008 – Sitemap índice + por tipo, só com páginas indexáveis

- Status: aceito
- Data: 2026-09-30

## Decisão

- `/sitemap.xml` (índice) → `sitemap-artigos`, `-paginas` (home, páginas e institucionais), `-categorias`, `-tags`, `-series`, `-autores`; tipo sem URL não gera arquivo.
- Fora: paginação, `/busca/`, 404, taxonomias e autores sem conteúdo.
- `lastmod`: `updatedAt ?? publishedAt`; taxonomia, autor e home pelo maior dos seus conteúdos; institucionais sem data. Sem `changefreq` nem `priority`.
- Acima de 50.000 URLs: `sitemap-<tipo>-2.xml` e seguintes. URLs em ordem de caminho.
- `indexavel` desligado: o índice sai vazio, para não contradizer o `noindex`.
