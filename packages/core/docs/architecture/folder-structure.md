# Estrutura de pastas do core

```
src/
├── index.ts            ".": head, crawlers, políticas, Issue/Result
├── head.ts  xml.ts  result.ts  crawlers.ts  policy.ts  (+ testes)
└── v1/
    ├── index.ts        "./v1"
    ├── site.ts  routes.ts  seo.ts  json-ld.ts
    ├── sitemap.ts  rss.ts  robots.ts  redirects.ts  headers.ts  files.ts
    ├── test-snapshots.ts   fixtures do content-model para os testes (fora da superfície)
    ├── *.test.ts
    └── __snapshots__/      saída esperada dos arquivos gerados
```

**Rota nova ou alterada:** `routes.ts` (e `RESERVED_SLUGS` se criar segmento) → testes de rotas → snapshots do sitemap.

**Arquivo gerado novo** (ex.: `ads.txt` na fase 3): `src/v1/<arquivo>.ts` + entrada em `edgeFiles` + teste com snapshot.

**Tipo de página novo no head:** variante em `SeoPage` e caso em `describe` de `seo.ts`.

**Crawler novo:** `CRAWLERS` + `CRAWLERS_REVIEWED_AT`; o snapshot do `robots.txt` muda.

**Schema v2:** `src/v2/` sobre `@orakel/content-model/v2`, subcaminho `./v2`.
