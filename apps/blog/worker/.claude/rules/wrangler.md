---
paths:
  - 'wrangler.jsonc'
  - 'worker-configuration.d.ts'
  - 'dev-assets/**'
---

# Configuração do wrangler

- Este `wrangler.jsonc` é a base: o build-site gera o de cada site a partir dele. Mudança aqui afeta todos os sites.
- `run_worker_first` fica só em `["/_e/*"]`; o resto do site não pode acionar o Worker.
- Depois de mudar: `pnpm types` e versione o `worker-configuration.d.ts` (nunca edite à mão).
- `ALLOW_COUNTRY_OVERRIDE` é só de desenvolvimento e do alvo local; nunca no alvo `cloudflare`.
- `dev-assets/_data/events-manifest.json` segue o `EventManifestSchema` do `@orakel/events`.
  Detalhes: `docs/decisions/0004-wrangler-base.md`
