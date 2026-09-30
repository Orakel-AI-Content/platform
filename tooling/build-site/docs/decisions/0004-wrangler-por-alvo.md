# 0004 – wrangler.jsonc por alvo, por convenção de nomes

- Status: aceito
- Data: 2026-09-30

A partir de `apps/blog/worker/wrangler.jsonc` (JSONC lido por `src/wrangler/jsonc.ts`):

|                             | `cloudflare`                                                | `local` (edge-local)                       |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `name`                      | `orakel-<site>`                                             | `orakel-<site>`                            |
| Domínio                     | `routes: [{ pattern: <SITE_DOMAIN>, custom_domain: true }]` | — (o edge-local mapeia `<site>.localhost`) |
| `EVENTS`                    | Analytics Engine (`analytics_engine_datasets`)              | service binding `ae-sim`                   |
| `vars`                      | `SITE_ID`; **nunca** `ALLOW_COUNTRY_OVERRIDE`               | `SITE_ID`, `ALLOW_COUNTRY_OVERRIDE=true`   |
| `main` / `assets.directory` | Worker da imagem / `./site`                                 | idem                                       |

Sem saída do OpenTofu. A fumaça do CI roda `wrangler deploy --dry-run` no alvo `cloudflare`.
