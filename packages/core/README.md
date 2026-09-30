# @orakel/core

SEO técnico e arquivos da borda dos sites, em funções puras sobre o snapshot v1 do
`@orakel/content-model`.

```ts
import { renderHead } from '@orakel/core';
import { contentPath, edgeFiles, seoHead } from '@orakel/core/v1';

// Layout: <Fragment set:html={head} />
const head = renderHead(seoHead({ type: 'content', content }, snapshot));

// Integração do Astro, no fim do build: grava robots.txt, _redirects, _headers, rss.xml e sitemaps.
const result = edgeFiles(snapshot);
if (!result.ok) throw permanentFailure(result.issues); // código 10 no render
```

Comandos (nesta pasta): `pnpm test` · `pnpm lint` · `pnpm typecheck`. Container limpo (da
raiz): `docker buildx bake core-test`. Documentação: `docs/README.md`.
