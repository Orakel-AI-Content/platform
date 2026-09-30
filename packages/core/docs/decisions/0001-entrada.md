# 0001 – Entrada do scaffold do core

- Status: aceito
- Data: 2026-09-30

## Contexto

Gerado pela skill `/scaffold` (modo `unit`) a partir de `docs/platform-requirements/12.0-fase-0-ambiente-local.md` e `10-politicas-e-conformidade.md` (`Orakel-AI-Content/workspace`, hashes no spec).

## Decisão

**Linha `packages/core` (11.1):**

> SEO (title, description, canonical, Open Graph, JSON-LD Article, BreadcrumbList, Person, Organization), sitemap, RSS, `robots.txt`, `_redirects`, `_headers`; funções puras com testes unitários

**L2, "SEO técnico e arquivos da borda":** sitemap só com páginas indexáveis e RSS dos últimos artigos; `robots.txt` da lista de crawlers da plataforma com a sobrescrita do site, sem bloquear o rastreio com `indexavel` desligado; `_redirects` com falha acima de 2.000 estáticos ou 100 dinâmicos e registro do uso para o alerta de 75%; `_headers` com `immutable` só em `/_astro/*` e nos arquivos do Pagefind com hash, e `X-Robots-Tag: noindex` com `indexavel` desligado; manifesto de eventos com os artigos publicados.

**P10:** buscadores e busca por IA liberados, treinamento de IA bloqueado; lista mantida pela plataforma, revisada a cada trimestre; cada site pode sobrescrever.

## Divergências e recortes

- **Manifesto de eventos:** a L2 o lista aqui, mas o `@orakel/events/v1` já tem `buildEventManifest` (ADR 0003 do events). O core só fornece `contentPath`; o blog monta o manifesto.
- **`ads.txt`, anúncios e afiliados:** o `09` os põe no core, mas são da fase 3.
- **Fixture `exemplo-a`:** a página `sobre` colidia com a institucional `/sobre/`; passou a `quem-somos` (ADR 0003).
