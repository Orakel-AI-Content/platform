# 0015 – Seeds, verificação e serviços opcionais do ambiente local

- Status: aceito
- Data: 2026-09-30

## Contexto

O 11.6 pede seeds em `infra/local/seeds`, carga sintética, E2E com o compose inteiro, e
Healthchecks, GlitchTip e Lighthouse CI como substitutos opcionais.

## Decisão

- **Seeds:** a lógica fica no `db:seed` do backoffice (usuários por papel, fixtures do
  `@orakel/content-model`); `infra/local/seeds/sites.json` guarda só o que é local — os
  domínios `<site>.localhost` de cada site de exemplo.
- **Comandos:**
  - `pnpm local:check` — serviços saudáveis (só `backoffice-migrate`, `s3-init` e
    `glitchtip-db` podem ter terminado), hostnames do Caddy, buckets, tabela do ClickHouse,
    isolamento das redes e recusas do proxy do socket. Sai com 1 se algo falhar.
  - `pnpm local:publish <site>` — `render` na `orakel-export` e `publish` na
    `orakel-publish` (`DEPLOY_TARGET=local`), como o `build-runner` fará.
  - `pnpm local:load [<site>]` — k6 2.3.0 no `edge-local` com `X-Test-Country` variado; confere
    os pontos no ClickHouse e sessões só fora da UE.
- **Perfis** (fora do `local:up`): `observability` — GlitchTip 6.2.6 (web e worker no mesmo
  container, banco `glitchtip` no Postgres, Valkey 9.0.6) e Healthchecks v4.4 (SQLite);
  `lighthouse` — LHCI server 0.15.1. Todos atrás do access-mock (`glitchtip.`, `hc.` e
  `lhci.orakel.localhost`). A coleta do Lighthouse é da promoção de release (backoffice).
- `ORAKEL_ENV_FILE` escolhe o arquivo de ambiente dos scripts (padrão `.env.local`).

## Consequências

- Os scripts leem o arquivo de ambiente sem executá-lo (`infra/local/lib.sh`).
- `SENTRY_DSN` e `HEARTBEAT_BASE_URL` apontam para os hosts internos quando o perfil está ligado.
