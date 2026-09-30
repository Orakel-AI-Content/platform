# 0002 – Subcaminho por versão do schema

- Status: aceito
- Data: 2026-09-30

## Decisão

- `@orakel/core/v1`: funções sobre os tipos do `@orakel/content-model/v1` (rotas, SEO, JSON-LD, sitemap, RSS, robots, `_redirects`, `_headers`, `edgeFiles`).
- `@orakel/core`: o que não depende do schema — `HeadTag`/`renderHead`, `CRAWLERS`, `CACHE_CONTROL`, `IMMUTABLE_PATHS`, `SECURITY_HEADERS`, `REDIRECT_LIMITS`, `Issue`/`Result`.
- Schema v2: `src/v2/` reaproveitando o neutro; a release que usa a v2 importa só `./v2`.

## Alternativas consideradas

Superfície única: imports mais curtos, mas a versão do schema ficaria implícita e fora de simetria com `content-client` e `events`.
