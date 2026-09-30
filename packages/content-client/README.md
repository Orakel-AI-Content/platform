# @orakel/content-client

Cliente da API de exportação do Backoffice: lê o snapshot NDJSON em streaming, valida pelo
`@orakel/content-model` e alimenta o Content Layer do Astro no build do blog.

```ts
// content.config.ts do blog
import { defineCollection } from 'astro:content';
import { snapshotLoaders } from '@orakel/content-client/v1/astro';

const loaders = snapshotLoaders({
  baseUrl: process.env.EXPORT_API_URL!, // rede interna
  site: process.env.SITE_ID!,
  token: process.env.EXPORT_BUILD_TOKEN!,
  metaFile: process.env.SNAPSHOT_META_FILE, // caminho absoluto; o render lê para o result.json
});

export const collections = { contents: defineCollection({ loader: loaders.contents }) /* … */ };
```

Comandos (nesta pasta): `pnpm test` · `pnpm lint` · `pnpm typecheck`. Container limpo (da
raiz): `docker buildx bake content-client-test`. Documentação: `docs/README.md`.
