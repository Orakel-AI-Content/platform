# 0010 – _redirects com limites e edgeFiles num passo

- Status: aceito
- Data: 2026-09-30

## Decisão

- Dinâmico: origem com `*` ou `:nome`. Limites em `REDIRECT_LIMITS`: 2.000 estáticos, 100 dinâmicos; `alert` a partir de 75% de um deles. Acima: `Issue` `redirect.limit-static`/`-dynamic`.
- Uma linha por redirect (`<de> <para> <status>`), em ordem de ID.
- `edgeFiles(snapshot)` devolve `Result<{ files, redirectUsage }>` com `robots.txt`, `_redirects`, `_headers`, `rss.xml` e os sitemaps; junta os problemas de `routeConflicts` e dos limites. O blog grava os arquivos numa integração do Astro e o render leva `redirectUsage` ao `result.json`; problema vira falha permanente (código 10).
