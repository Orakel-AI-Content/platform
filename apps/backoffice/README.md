# @orakel/backoffice

Ferramenta administrativa da plataforma Orakel AI: conteúdo e configuração dos sites,
revisão, publicação, registro de sites e releases, e a API de exportação que o build
consome. Next.js 16 (App Router), Drizzle sobre Postgres, Graphile Worker.

## Rodar

Ambiente local (raiz): `pnpm local:images && pnpm local:up && pnpm local:seed`, e abra
`https://admin.orakel.localhost` (login de teste pelo access-mock). Detalhes e CA local:
`docs/guides/local-setup.md` da raiz.

## Comandos (nesta pasta)

| Comando                            | O que faz                                           |
| ---------------------------------- | --------------------------------------------------- |
| `pnpm dev`                         | `next dev` (use com `BACKOFFICE_UPSTREAM` no Caddy) |
| `pnpm build` · `pnpm start`        | Build standalone e servidor                         |
| `pnpm worker`                      | Graphile Worker (jobs e agregador)                  |
| `pnpm test`                        | Unitários                                           |
| `pnpm test:contract`               | Contrato com Postgres (`DATABASE_URL`)              |
| `pnpm test:e2e`                    | Playwright contra o ambiente local                  |
| `pnpm db:generate --name x`        | Nova migração a partir do schema                    |
| `pnpm db:migrate` · `pnpm db:seed` | Migrações e dados de exemplo                        |

## Documentação

`docs/README.md` (desta pasta) e, para o sistema, `docs/` da raiz.
