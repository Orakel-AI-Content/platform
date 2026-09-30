# 0010 – Redes do compose

- Status: aceito
- Data: 2026-09-30

## Contexto

O build roda código do repositório com o conteúdo dos sites (12.0, L3). O `render` não pode
alcançar o Postgres nem a internet; o `publish`, único com o token de deploy, não pode alcançar a
API interna. O 11.6 define as redes `internal`, `export`, `publish` e `edge`.

## Decisão

Redes com nome fixo (o `build-runner` cria os containers efêmeros nelas pelo nome):

| Rede              | Quem                                                             | Regra                                |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------ |
| `orakel-internal` | Postgres, backoffice (web, worker, build-runner), `blog-preview` | Serviços da VPS entre si             |
| `orakel-export`   | `backoffice-web`, `blog-preview`, `render`                       | `internal: true`: sem internet       |
| `orakel-publish`  | `publish`, `edge-local` (administração), S3                      | Nunca a API interna                  |
| `orakel-docker`   | `build-runner`, `docker-socket-proxy`                            | `internal: true`; só a API do Docker |
| `orakel-edge`     | Caddy, `edge-local`, ClickHouse, S3 (só local)                   | Substitutos da borda                 |

- As quatro primeiras ficam no compose base (`infra/vps/compose.yaml`); `orakel-edge`, no
  override local.
- `orakel-docker` é a quinta rede, fora do 11.6: isola o proxy do socket do resto da VPS.
- `blog-preview` fica em `internal` e `export` (lê a API de exportação como o `render`).
- `pnpm local:check` confere o isolamento: `export` alcança a API de exportação e não alcança o
  Postgres nem a internet; `publish` alcança o `edge-local` e não o backoffice.

## Consequências

- Em produção, `orakel-publish` precisa de saída para a Cloudflare e o R2; `internal: true`
  fica só em `export` e `docker`.
- A API de exportação e a interna só respondem dentro das redes (o Caddy devolve 404 para
  `/api/export/*` e `/api/internal/*`).
