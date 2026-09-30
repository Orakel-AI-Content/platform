# Estrutura de pastas do Worker de borda

Consulte para saber onde criar cada arquivo.

```
apps/blog/worker/
├── wrangler.jsonc            # base: dev e tipos; o build-site gera a de cada site (ADR 0004)
├── worker-configuration.d.ts # gerado por `pnpm types`; versionado, fora do lint
├── dev-assets/               # site mínimo para `pnpm dev`
│   ├── index.html  404.html
│   └── _data/events-manifest.json
└── src/
    ├── index.ts              # borda: env, request, Response
    ├── pageview.ts           # fluxo do pageview
    ├── bot.ts  origin.ts  country.ts  device.ts
    ├── manifest-cache.ts
    └── test-builders.ts      # dublês (não entra no Worker publicado)
```

Testes ao lado do código (`*.test.ts`; as quatro regras estão em `rules.test.ts`).

## Como acrescentar

**Uma regra de validação:** módulo puro em `src/`, chamado em `pageview.ts` na posição
certa da ordem, com motivo de descarte novo em `DISCARD_REASONS` do `@orakel/events` se
precisar.

**Um tipo de evento (fase 3: impressão, clique):** endpoint em `routes.ts` do `@orakel/events`;
fluxo próprio (`impression.ts`, `click.ts`) com a mesma forma de `pageview.ts`; roteamento
no `index.ts`. Cliques ganham o binding da fila `clicks` no `wrangler.jsonc` (e `pnpm types`).

**Um binding ou variável:** `wrangler.jsonc` → `pnpm types` → uso via `env` só no `index.ts`.
