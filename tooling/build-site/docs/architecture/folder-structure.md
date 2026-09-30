# Estrutura de pastas do build-site

```
src/
├── cli.ts  contract.ts  env.ts  failures.ts  paths.ts  ssr.ts
├── render/     render.ts (orquestra), astro-build.ts (Astro in-process), count.ts, page-drop.ts
├── wrangler/   jsonc.ts, targets.ts
├── publish/    publish.ts (orquestra), archive.ts, cloudflare.ts, edge-local.ts, build-cache.ts
└── *.test.ts
scripts/        snapshot-server.ts, synthetic-snapshot.ts, measure.ts, smoke.sh
docs/measurements.md
../../docker/site-builder/Dockerfile
```

**Campo novo no `result.json`:** schema em `contract.ts` (mudança aditiva; campo obrigatório novo = `formatVersion` 2), preenchimento em `render.ts`, leitura no backoffice.

**Alvo de deploy novo:** variante em `PublishEnvSchema`, função em `src/publish/`, ramo em `publish.ts`, config em `wrangler/targets.ts` se precisar.

**Variável nova do build-runner:** `RenderEnvSchema` ou `PublishEnvSchema`, e o `build-runner` do backoffice.
