# platform

Monorepo da plataforma Orakel AI: uma rede de 5 a 20 sites de conteúdo gerados a partir de uma
única base de código, com Backoffice próprio, geração de conteúdo com LLM e revisão humana.

- **Stack:** TypeScript 6 (estrito), Node 24, pnpm 11 + Turborepo, Postgres 18.
- **Sites:** Astro estático na Cloudflare, um por `SITE_ID`.
- **Backoffice:** Next.js + Graphile Worker na VPS (Docker Compose).
- **Estado:** fase 0 — tudo roda localmente em containers, antes do primeiro deploy.

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Primeira vez](#primeira-vez)
- [Comandos](#comandos)
- [Endereços e acessos](#endereços-e-acessos)
- [Problemas comuns](#problemas-comuns)
- [Unidades](#unidades)
- [Documentação](#documentação)

## Pré-requisitos

| Ferramenta | Versão              | Observação                                                    |
| ---------- | ------------------- | ------------------------------------------------------------- |
| Node       | 22+ (para o pnpm)   | Os scripts baixam e usam o **Node 24.21.0** fixado (`.nvmrc`) |
| pnpm       | 11, via Corepack    | `corepack enable`; a versão vem de `packageManager`           |
| Docker     | Compose v2 e Buildx | Docker Desktop no macOS; no Linux, ajuste `DOCKER_SOCKET_GID` |

## Primeira vez

```sh
corepack enable
pnpm install                   # dependências e git hooks (lefthook)
cp .env.example .env.local     # valores locais; nunca commite .env.local
pnpm local:images              # constrói as imagens backoffice, site-builder e edge-local
pnpm local:up                  # sobe o compose, cria os buckets e migra o banco
pnpm local:seed                # usuários de teste e os sites exemplo-a e exemplo-b
pnpm local:trust               # confia na CA do Caddy (macOS; pede a senha) — depois feche o Chrome (⌘Q)
pnpm local:check               # confere o ambiente inteiro
pnpm local:publish exemplo-a   # build + publicação → https://exemplo-a.localhost
```

Pronto: o Backoffice fica em https://admin.orakel.localhost (veja
[Endereços e acessos](#endereços-e-acessos)).

## Comandos

Todos rodam na raiz do repositório, salvo indicação.

### Verificar o código

Rode os três primeiros antes de concluir qualquer mudança.

| Quero…                                       | Comando                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| Rodar o lint                                 | `pnpm lint`                                               |
| Checar os tipos                              | `pnpm typecheck`                                          |
| Rodar os testes                              | `pnpm test`                                               |
| Testar componentes do Backoffice no Chromium | `pnpm turbo run test:browser --filter=@orakel/backoffice` |
| Formatar (ou só conferir a formatação)       | `pnpm format` · `pnpm format:check`                       |
| Fazer o build de tudo                        | `pnpm build`                                              |
| Rodar uma tarefa numa unidade só             | `pnpm turbo run <tarefa> --filter=@orakel/<nome>`         |
| Rodar um arquivo de teste                    | `pnpm vitest run <caminho>` (na pasta da unidade)         |

Tocou `apps/backoffice/src`? Rode também o `test:browser`.

### Desenvolver

| Quero…                                    | Comando                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Todas as unidades em modo dev             | `pnpm dev`                                                                        |
| Um site com fixtures, sem Docker          | `pnpm --filter @orakel/blog dev` → http://localhost:4321 (¹)                      |
| A visualização SSR dos sites, sem Docker  | `pnpm --filter @orakel/blog preview` → http://localhost:4321/exemplo-a/ (¹)       |
| O Backoffice em `next dev` atrás do Caddy | `pnpm --filter @orakel/backoffice dev` + `infra/local/compose.sh up -d caddy` (²) |

(¹) No `.env.local`: `CONTENT_SOURCE=fixture` e `SITE_ID=exemplo-a`.

(²) No `.env.local`, descomente `BACKOFFICE_UPSTREAM=host.docker.internal:3000`; o
`admin.orakel.localhost` passa a apontar para o `next dev`. Para a visualização na máquina, o
mesmo com `BLOG_PREVIEW_UPSTREAM=host.docker.internal:4321`.

### Ambiente local (Docker)

| Quero…                                        | Comando                                                     |
| --------------------------------------------- | ----------------------------------------------------------- |
| Subir o ambiente (e migrar o banco)           | `pnpm local:up`                                             |
| Popular usuários de teste e sites de exemplo  | `pnpm local:seed`                                           |
| Conferir se está tudo saudável                | `pnpm local:check`                                          |
| Parar (mantém os dados)                       | `pnpm local:down`                                           |
| Parar e **apagar os dados** (banco, buckets…) | `pnpm local:reset` — depois rode `pnpm local:trust` de novo |
| Reconstruir as imagens                        | `pnpm local:images`                                         |
| Ver os containers                             | `infra/local/compose.sh ps`                                 |
| Acompanhar os logs de um serviço              | `infra/local/compose.sh logs -f <serviço>`                  |
| Reiniciar um serviço                          | `infra/local/compose.sh restart <serviço>`                  |
| Qualquer outro comando do compose             | `infra/local/compose.sh <args>`                             |
| Abrir o Postgres no terminal                  | `psql postgres://orakel:orakel-local@localhost:5432/orakel` |
| Subir GlitchTip e Healthchecks                | `infra/local/compose.sh --profile observability up -d`      |
| Subir o servidor do Lighthouse CI             | `infra/local/compose.sh --profile lighthouse up -d`         |

Serviços mais usados nos logs: `backoffice-web`, `backoffice-worker`, `build-runner`,
`blog-preview`, `caddy`, `edge-local`. Com um perfil ativo, repita o `--profile` no `ps`,
`logs` e `down`.

`ORAKEL_ENV_FILE=/caminho/env` faz o `compose.sh` e os scripts `local:*` usarem outro arquivo de
ambiente (padrão: `.env.local`).

### Publicar e medir

| Quero…                                            | Comando                                       |
| ------------------------------------------------- | --------------------------------------------- |
| Publicar um site sem passar pelo Backoffice       | `pnpm local:publish <site>`                   |
| Gerar carga de pageviews e conferir no ClickHouse | `pnpm local:load [<site>]`                    |
| Acompanhar os builds disparados pelo Backoffice   | `infra/local/compose.sh logs -f build-runner` |

Pelo Backoffice, toda gravação agenda o build do site; depois de `BUILD_WINDOW_SECONDS` (30 s no
local) o site é publicado. Em `/sites`, "Publicar agora" antecipa o build.

### Testes E2E (Playwright)

| Quero…                                               | Comando                                 |
| ---------------------------------------------------- | --------------------------------------- |
| E2E de telas de uma área, sem Docker (só o Postgres) | `pnpm local:e2e:telas <área>[,<área>…]` |
| E2E de uma área contra o ambiente local              | `pnpm local:e2e:area <área>[,<área>…]`  |
| Só as jornadas `@smoke` contra o ambiente local      | `pnpm local:e2e:area smoke`             |
| E2E completo contra o ambiente local                 | `pnpm local:e2e`                        |

Áreas = arquivos `apps/backoffice/test/e2e/<área>.spec.ts` (ex.: `sites`, `midia`, `revisao`).
Argumentos extras vão para o Playwright.

### Imagens Docker

| Quero…                                               | Comando                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| Construir um grupo de imagens                        | `docker/bake.sh [images\|release\|local\|default]` |
| Construir uma imagem só                              | `docker buildx bake <alvo> --load`                 |
| Lint, tipos e testes de um pacote em container limpo | `docker buildx bake <pacote>-test`                 |
| Fumaça da imagem `site-builder`                      | `tooling/build-site/scripts/smoke.sh`              |

`PLATFORM=linux/amd64` força a arquitetura da VPS (o padrão local é a da máquina).

## Endereços e acessos

Valores padrão do `.env.example`, só do ambiente local.

| Endereço                                                  | Serviço                               | Acesso                                    |
| --------------------------------------------------------- | ------------------------------------- | ----------------------------------------- |
| https://admin.orakel.localhost                            | Backoffice                            | Login de teste                            |
| https://preview.orakel.localhost/exemplo-a/guia-completo/ | Visualização de rascunhos             | Login de teste                            |
| https://exemplo-a.localhost · https://exemplo-b.localhost | Sites publicados                      | Público, depois do `local:publish`        |
| https://media.exemplo-a.localhost                         | Mídia do site                         | Público, só leitura                       |
| https://s3.orakel.localhost                               | Console do SeaweedFS                  | Login de teste                            |
| https://glitchtip.orakel.localhost                        | GlitchTip (perfil `observability`)    | Login de teste + conta na primeira visita |
| https://hc.orakel.localhost                               | Healthchecks (perfil `observability`) | Login de teste + conta na primeira visita |
| https://lhci.orakel.localhost                             | LHCI server (perfil `lighthouse`)     | Login de teste                            |
| `localhost:5432`                                          | Postgres (banco `orakel`)             | `orakel` / `orakel-local`                 |
| http://localhost:8333                                     | S3                                    | `orakel-local` / `orakel-local-secret`    |
| http://localhost:8123/play                                | ClickHouse (Analytics Engine local)   | `orakel` / `orakel-local`                 |

**Login de teste:** sem senha; a tela lista os usuários e basta clicar em um —
`admin@orakel.local`, `editor@orakel.local`, `revisor@orakel.local` ou `operacao@orakel.local`
(um por papel).

## Problemas comuns

| Sintoma                                    | Solução                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `Falta .env.local`                         | `cp .env.example .env.local`                                                              |
| `defina <VARIÁVEL>` no compose             | Copie a variável do `.env.example` para o `.env.local`                                    |
| `ERR_CERT_AUTHORITY_INVALID` no Chrome     | `pnpm local:trust` e ⌘Q no Chrome (a CA muda a cada `local:reset`)                        |
| `local:check` falha em "Serviços"          | `infra/local/compose.sh logs <serviço>` (`backoffice-migrate` e `s3-init` param sozinhos) |
| Imagem quebrada num site local             | `pnpm local:check` e `pnpm local:seed`                                                    |
| Aviso de plataforma `linux/amd64`          | `pnpm local:images`                                                                       |
| Porta ocupada                              | Libere 80, 443, 5432, 8123, 8333 ou 8788                                                  |
| `ERR_PNPM_NO_MATURE_MATCHING_VERSION`      | A versão saiu há menos de 24 h; use a anterior no `catalog` ou espere                     |
| Linux: `build-runner` sem acesso ao Docker | `DOCKER_SOCKET_GID` = gid do grupo `docker` (`getent group docker`)                       |

## Unidades

| Unidade                                              | O que é                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| [`apps/backoffice`](apps/backoffice)                 | Next.js: UI, API de exportação; processos worker e build-runner       |
| [`apps/blog`](apps/blog)                             | Sites Astro por `SITE_ID` (estático) e visualização SSR               |
| [`apps/blog/worker`](apps/blog/worker)               | Worker de borda `/_e/*`: pageviews → Analytics Engine                 |
| [`packages/content-model`](packages/content-model)   | Schemas Zod de conteúdo e configuração; fixtures dos sites de exemplo |
| [`packages/content-client`](packages/content-client) | Cliente da API de exportação e loaders do Astro                       |
| [`packages/core`](packages/core)                     | Rotas, head e JSON-LD, sitemap, RSS, robots, `_redirects`, `_headers` |
| [`packages/tokens`](packages/tokens)                 | Temas DTCG → variáveis CSS e fontes, contraste AA verificado          |
| [`packages/elements`](packages/elements)             | Web Components: carrossel, menu, copiar link, compartilhar            |
| [`packages/events`](packages/events)                 | Formato dos eventos, manifesto e script do navegador                  |
| [`packages/build-contract`](packages/build-contract) | Contrato do volume `/build` (`result.json`, `publish.json`)           |
| [`tooling/build-site`](tooling/build-site)           | Entrypoints `render`, `publish` e `ssr` da imagem `site-builder`      |
| [`infra/local/edge-local`](infra/local/edge-local)   | Substituto local do deploy na Cloudflare e `ae-sim`                   |

Cada pacote se chama `@orakel/<nome da pasta>` (o Worker é `@orakel/blog-worker`). Unidade nova:
`/scaffold` no caminho dela.

## Documentação

- [`docs/README.md`](docs/README.md) — índice.
- [`docs/architecture/overview.md`](docs/architecture/overview.md) — planos, contratos, serviços
  e redes.
- [`docs/guides/local-setup.md`](docs/guides/local-setup.md) — ambiente local em detalhe.
- [`docs/conventions/`](docs/conventions) — código, testes e git.
- [`docs/decisions/`](docs/decisions) — ADRs.
- [`.env.example`](.env.example) — todas as variáveis de ambiente, comentadas.
- [`docs/guides/claude-code.md`](docs/guides/claude-code.md) — como o repositório usa o Claude
  Code.
