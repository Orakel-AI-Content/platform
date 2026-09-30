# 0004 – wrangler.jsonc base na unidade

- Status: aceito
- Data: 2026-09-29

## Contexto

A entrada diz que o `wrangler.jsonc` de cada site é gerado no build, por alvo (`local` e
`cloudflare`). Mas a unidade também precisa de uma configuração para `wrangler dev` e
para gerar os tipos dos bindings.

## Decisão

- `wrangler.jsonc` **base** na unidade: `main`, `compatibility_date` (2026-09-22),
  `assets` com `run_worker_first: ["/_e/*"]`, `html_handling: "auto-trailing-slash"`,
  `not_found_handling: "404-page"`, dataset `events` no binding `EVENTS`, `observability`
  com amostragem de 10% e as variáveis de desenvolvimento (`SITE_ID`,
  `ALLOW_COUNTRY_OVERRIDE`).
- `dev-assets/` é um site mínimo para `wrangler dev`, com o manifesto de eventos dos
  artigos 1 e 2 do site de exemplo `exemplo-a`.
- `worker-configuration.d.ts` é gerado por `pnpm types`, com `--strict-vars=false` para
  as variáveis serem `string` e não o valor de desenvolvimento. É versionado e fica fora
  do lint e do Prettier.
- O `build-site` gera o `wrangler.jsonc` de cada site a partir desta base, trocando nome,
  domínio, `SITE_ID` e assets; no alvo `cloudflare`, sem `ALLOW_COUNTRY_OVERRIDE`.
- **wrangler 4.143.0**, não a 4.144.0 confirmada: ela saiu no mesmo dia, e a raiz exige
  24 h de maturidade (`minimumReleaseAge`).

## Alternativas consideradas

Sem configuração na unidade, só a gerada no build: sem `wrangler dev` nem tipos dos
bindings até o `build-site` existir.

## Consequências

Mudou o `wrangler.jsonc`? Rode `pnpm types` e versione o `worker-configuration.d.ts`.
