# @orakel/backoffice

Ferramenta administrativa da plataforma Orakel AI: conteúdo e configuração dos sites,
revisão, publicação, registro de sites e releases, e a API de exportação que o build
consome. Next.js 16 (App Router), Drizzle sobre Postgres, Graphile Worker.

## Rodar

Ambiente local (raiz): `pnpm local:images && pnpm local:up && pnpm local:seed`, e abra
`https://admin.orakel.localhost` (login de teste pelo access-mock). No compose, a mesma imagem
atende quatro serviços: `backoffice-migrate`, `backoffice-web`, `backoffice-worker` e
`build-runner` (este fala com o Docker só pelo `docker-socket-proxy`). O seed aplica os domínios
`<site>.localhost` de `infra/local/seeds/sites.json` aos sites das fixtures. Detalhes, CA local e
modo dev atrás do Caddy: `README.md` e `docs/guides/local-setup.md` da raiz.

**Builds (ADR 0008):** toda gravação que vai para um site agenda o build dele; depois da janela
(`BUILD_WINDOW_SECONDS`, 30 s no local) o `build-runner` roda o `render` e o `publish` e o site
é atualizado em `https://<site>.localhost`. Em `/sites`, "Publicar agora" antecipa o build e a
coluna "Último build" mostra o resultado; falha permanente pausa o site com o motivo.

## Comandos (nesta pasta)

| Comando                            | O que faz                                           |
| ---------------------------------- | --------------------------------------------------- |
| `pnpm dev`                         | `next dev` (use com `BACKOFFICE_UPSTREAM` no Caddy) |
| `pnpm build` · `pnpm start`        | Build standalone e servidor                         |
| `pnpm worker`                      | Graphile Worker (jobs e agregador)                  |
| `pnpm build-runner`                | Task `build` (precisa do Docker pelo proxy)         |
| `pnpm test`                        | Unitários                                           |
| `pnpm test:contract`               | Contrato com Postgres (`DATABASE_URL`)              |
| `pnpm test:e2e`                    | Playwright contra o ambiente local                  |
| `pnpm db:generate --name x`        | Nova migração a partir do schema                    |
| `pnpm db:migrate` · `pnpm db:seed` | Migrações; usuários por papel e sites de exemplo    |

## Documentação

`docs/README.md` (desta pasta) e, para o sistema, `docs/` da raiz.
