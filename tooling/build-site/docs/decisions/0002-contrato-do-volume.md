# 0002 – Contrato do volume /build, result.json sempre, códigos de saída

- Status: aceito
- Data: 2026-09-30

## Decisão

- O `build-runner` cria um volume por build, montado em `/build` no `render` e depois no `publish`:
  `site/`, `wrangler.cloudflare.jsonc`, `wrangler.local.jsonc`, `result.json` (render), `publish.json` (publish).
- `result.json` (`formatVersion: 1`) é escrito **sempre**: sucesso com `pendingChangeIds`, `pages`, `files`, `redirectUsage`, `durationMs`; falha com `failure: { kind, message }` — o motivo que o backoffice mostra ao pausar o site. `publish.json` segue o mesmo padrão, com `versionId` e `cacheKey`.
- Código de saída e arquivo concordam: 0 `ok`, 10 `permanent`, 20 `transient`. Erro sem `kind` é transitório.
- A classificação vem do erro, não do log: o render roda o Astro no mesmo processo e procura `kind` na cadeia de `cause` (o blog e o content-client põem `kind`; o Astro às vezes embrulha).
- Schemas Zod em `@orakel/build-site/contract`, que o backoffice importa.

## Consequências

Verificado de ponta a ponta: token errado → 10; API fora → 20; trava → 10; variáveis inválidas → 10, sempre com `result.json`.
