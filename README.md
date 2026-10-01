# platform

Monorepo da plataforma Orakel AI: uma rede de 5 a 20 sites de conteúdo gerados a partir
de uma única base de código, com Backoffice próprio, geração de conteúdo com LLM e
revisão humana.

- **Stack:** TypeScript 6 (estrito), Node 24, pnpm 11 + Turborepo, Postgres 18.
- **Sites:** Astro estático na Cloudflare (um Worker com Static Assets por site),
  parametrizado por `SITE_ID`.
- **Backoffice:** Next.js + Graphile Worker na VPS (Docker Compose).
- **Estado:** fase 0 — tudo roda localmente em containers, antes do primeiro deploy. Build e
  publicação pelo backoffice prontos (L3); próximo passo: os módulos do backoffice (L4).

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Primeira vez](#primeira-vez)
- [Comandos](#comandos)
- [Ambiente local](#ambiente-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Fluxos comuns](#fluxos-comuns)
- [Unidades](#unidades)
- [CI e imagens](#ci-e-imagens)
- [Estrutura](#estrutura)
- [Problemas comuns](#problemas-comuns)
- [Documentação](#documentação)

## Pré-requisitos

| Ferramenta | Versão                | Observação                                                                 |
| ---------- | --------------------- | -------------------------------------------------------------------------- |
| Node       | 22+ para rodar o pnpm | Os scripts usam o **Node 24.21.0** fixado (`devEngines.runtime`, `.nvmrc`) |
| pnpm       | 11, via Corepack      | `corepack enable`; a versão vem de `packageManager`                        |
| Docker     | Compose v2 e Buildx   | Docker Desktop no macOS; no Linux, veja `DOCKER_SOCKET_GID`                |

Dependência nova: versão só no `catalog` de `pnpm-workspace.yaml` (na unidade, `catalog:`),
com `minimumReleaseAge` de 24 h.

## Primeira vez

```sh
corepack enable
pnpm install                   # instala e ativa os git hooks (lefthook)
cp .env.example .env.local     # valores locais; nunca commite .env.local
pnpm local:images              # constrói backoffice, site-builder e edge-local
pnpm local:up                  # sobe o compose, cria os buckets e migra o banco
pnpm local:seed                # usuários de teste e os sites exemplo-a e exemplo-b
pnpm local:check               # confere o ambiente inteiro
pnpm local:publish exemplo-a   # build + publicação → https://exemplo-a.localhost
```

**CA local do Caddy (uma vez):** os hosts `*.localhost` usam HTTPS com a CA interna do Caddy.
Para o navegador confiar:

```sh
infra/local/compose.sh cp caddy:/data/caddy/pki/authorities/local/root.crt /tmp/caddy-root.crt
# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/caddy-root.crt
```

Já tinha um `.env.local`? Compare com o `.env.example` e acrescente o que falta (o compose
avisa qual variável falta); comente `BLOG_PREVIEW_UPSTREAM` para a visualização usar o
container `blog-preview`.

## Comandos

Todos na raiz.

### Desenvolvimento

| Comando                                           | O que faz                                         |
| ------------------------------------------------- | ------------------------------------------------- |
| `pnpm install`                                    | Instala as dependências e os git hooks            |
| `pnpm dev`                                        | Todas as unidades em modo dev                     |
| `pnpm build`                                      | Build de todas as unidades (Turborepo, com cache) |
| `pnpm lint`                                       | ESLint das unidades e dos arquivos da raiz        |
| `pnpm typecheck`                                  | `tsc` (e `astro check`) de todas as unidades      |
| `pnpm test`                                       | Vitest de todas as unidades                       |
| `pnpm format` · `pnpm format:check`               | Prettier no repositório (escreve · só confere)    |
| `pnpm turbo run <tarefa> --filter=@orakel/<nome>` | Uma tarefa em uma unidade                         |
| `pnpm vitest run <caminho>` (na pasta da unidade) | Um arquivo de teste                               |

Antes de concluir qualquer mudança: `pnpm lint`, `pnpm typecheck` e `pnpm test`.

### Ambiente local

| Comando                         | O que faz                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm local:images`             | Constrói as imagens (`backoffice`, `site-builder`, `edge-local`) com as tags de produção                   |
| `pnpm local:up`                 | Sobe o compose (base + override local), espera ficar saudável e roda `db:migrate`                          |
| `pnpm local:seed`               | Usuários de teste por papel e os sites de exemplo, com domínios `<site>.localhost`                         |
| `pnpm local:check`              | Serviços, hostnames, buckets, ClickHouse, isolamento das redes e proxy do socket; sai com 1 se algo falhar |
| `pnpm local:publish <site>`     | `render` (rede export) + `publish` (rede publish) no `edge-local`, como o `build-runner`                   |
| `pnpm local:load [<site>]`      | Carga k6 de pageviews com países variados; confere os pontos no ClickHouse                                 |
| `pnpm local:e2e`                | E2E com Playwright contra o ambiente local                                                                 |
| `pnpm local:down`               | Para os containers (mantém os dados)                                                                       |
| `pnpm local:reset`              | Para e **apaga os volumes** (banco, buckets, ClickHouse)                                                   |
| `infra/local/compose.sh <args>` | Qualquer comando do compose com os arquivos e o `.env.local` certos                                        |

Exemplos com o `compose.sh`: `ps`, `logs -f backoffice-web`, `restart caddy`,
`run --rm s3-init`, `--profile observability up -d`.

`ORAKEL_ENV_FILE=/caminho/env` faz o `compose.sh` e os scripts `local:*` usarem outro arquivo
de ambiente (padrão: `.env.local`).

### Imagens

| Comando                               | O que faz                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker/bake.sh [grupo]`              | Grupos `images` (backoffice), `release` (site-builder), `local` (edge-local), `default` (todos; é o `pnpm local:images`). Local: arquitetura da máquina; CI: `linux/amd64` (a da VPS); `PLATFORM=linux/amd64` força |
| `docker buildx bake <alvo> --load`    | Uma imagem só (ex.: `site-builder`, `edge-local`)                                                                                                                                                                   |
| `docker buildx bake <pacote>-test`    | Lint, tipos e testes de um pacote em container limpo (`content-model`, `content-client`, `core`, `tokens`, `elements`, `events`)                                                                                    |
| `tooling/build-site/scripts/smoke.sh` | Fumaça da imagem `site-builder` (render e publish)                                                                                                                                                                  |

## Ambiente local

O compose de produção (`infra/vps/compose.yaml`) é a base; `infra/local/compose.override.yaml`
acrescenta as portas locais e os substitutos da nuvem. Só as variáveis do `.env.example`
mudam entre local e produção.

### Endereços

| Endereço                                            | Serviço                                       | Acesso                                              |
| --------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| `https://admin.orakel.localhost`                    | Backoffice (`backoffice-web`)                 | Login de teste do access-mock, um usuário por papel |
| `https://preview.orakel.localhost/<site>/<caminho>` | Visualização de rascunhos (`blog-preview`)    | Login de teste                                      |
| `https://<site>.localhost`                          | Sites publicados (`edge-local`)               | Público                                             |
| `https://media.<site>.localhost`                    | Mídia do site (bucket `media-<site>`)         | Público, só leitura, cache imutável                 |
| `https://s3.orakel.localhost`                       | Console do SeaweedFS                          | Login de teste                                      |
| `https://glitchtip.orakel.localhost`                | GlitchTip (perfil `observability`)            | Login de teste + conta no GlitchTip                 |
| `https://hc.orakel.localhost`                       | Healthchecks (perfil `observability`)         | Login de teste + conta no Healthchecks              |
| `https://lhci.orakel.localhost`                     | LHCI server (perfil `lighthouse`)             | Login de teste                                      |
| `localhost:5432`                                    | Postgres 18.6                                 | `POSTGRES_*`                                        |
| `http://localhost:8333`                             | S3 (SeaweedFS 4.48)                           | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`         |
| `http://localhost:8123`                             | ClickHouse (Analytics Engine local)           | `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD`           |
| `http://localhost:8788`                             | access-mock (JWKS em `/cdn-cgi/access/certs`) | —                                                   |

Subdomínios de `.localhost` resolvem sem editar o `/etc/hosts`. As portas só escutam em
`127.0.0.1`.

### Serviços

| Serviço                     | Papel                                                            | Em produção                   |
| --------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| `postgres`                  | Banco do backoffice                                              | Igual (VPS)                   |
| `backoffice-migrate`        | Migrações (one-shot, a cada `up`)                                | Igual                         |
| `backoffice-web`            | UI, Publish API, API de exportação                               | Igual                         |
| `backoffice-worker`         | Jobs (Graphile Worker) e agregador                               | Igual                         |
| `build-runner`              | Task `build`: containers `render` e `publish` pela API do Docker | Igual                         |
| `docker-socket-proxy`       | API do Docker com lista de rotas, só para o `build-runner`       | Igual                         |
| `blog-preview`              | Visualização SSR de todos os sites (`site-builder ssr`)          | Igual                         |
| `caddy` + `access-mock`     | TLS interno e login de teste                                     | Cloudflare Tunnel + Access    |
| `s3`, `s3-init`, `s3-admin` | S3, criação dos buckets (one-shot) e console                     | R2                            |
| `edge-local`                | Um Worker por site, versões e rollback; `ae-sim`                 | Cloudflare Workers            |
| `clickhouse`                | Tabela `analytics.events` no layout do Analytics Engine          | Workers Analytics Engine      |
| Perfil `observability`      | `glitchtip` (+ `glitchtip-db`, `valkey`) e `healthchecks`        | Sentry/GlitchTip e heartbeats |
| Perfil `lighthouse`         | `lhci-server`                                                    | PageSpeed Insights            |

Buckets (criados pelo `s3-init` a cada `local:up`): `media-originals`, `build-cache`,
`backups`, `brasil` e `media-<site>` para cada site de `LOCAL_SITES`.

### Redes

| Rede              | Quem                                           | Regra                                |
| ----------------- | ---------------------------------------------- | ------------------------------------ |
| `orakel-internal` | Postgres, backoffice, `blog-preview`           | Serviços da VPS entre si             |
| `orakel-export`   | `backoffice-web`, `blog-preview`, `render`     | Só a API de exportação; sem internet |
| `orakel-publish`  | `publish`, `edge-local`, S3                    | Nunca a API interna                  |
| `orakel-docker`   | `build-runner`, `docker-socket-proxy`          | Só a API do Docker; sem internet     |
| `orakel-edge`     | Caddy, `edge-local`, ClickHouse, S3 (só local) | Substitutos da borda                 |

O `pnpm local:check` confere esse isolamento e as recusas do proxy (`exec`, `pull`, redes).

## Variáveis de ambiente

Referência completa e comentada: [`.env.example`](.env.example). Cada unidade valida as que
usa em `src/env.ts` (Zod) e falha no boot se faltar alguma.

| Grupo            | Variáveis                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres         | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`                                                                                 |
| Tokens internos  | `EXPORT_BUILD_TOKEN`, `EXPORT_PREVIEW_TOKEN`, `GENERATOR_TOKEN`                                                                                     |
| Access           | `ACCESS_TEAM_DOMAIN`, `ACCESS_JWKS_URL`, `ACCESS_AUD`                                                                                               |
| S3               | `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                                                                                           |
| Sites            | `CONTENT_SOURCE` (`api` ou `fixture`), `SITE_ID`, `EXPORT_API_URL`, `BLOG_PREVIEW_UPSTREAM` (opcional)                                              |
| Ambiente local   | `LOCAL_SITES`, `LOCAL_MEDIA_HOSTS`, `DOCKER_SOCKET_GID`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `BACKOFFICE_UPSTREAM` (opcional)                 |
| Deploy e imagens | `DEPLOY_TARGET` (`local` ou `cloudflare`), `IMAGE_REGISTRY`, `BUILD_WINDOW_SECONDS`, `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` (só produção) |
| Analytics Engine | `AE_SQL_TRANSPORT`, `AE_SQL_URL`                                                                                                                    |
| Operação         | `BR_BACKUP_ENDPOINT`, `HEARTBEAT_BASE_URL`, `SENTRY_DSN`, `LIGHTHOUSE_PROVIDER` (`local` ou `psi`)                                                  |

`.env` e `.env.local` ficam fora do Git; nunca coloque valores reais nos arquivos
versionados.

## Fluxos comuns

**Site a partir das fixtures, sem compose:**

```sh
# .env.local: CONTENT_SOURCE=fixture e SITE_ID=exemplo-a
pnpm --filter @orakel/blog dev        # http://localhost:4321
pnpm --filter @orakel/blog preview    # visualização SSR: http://localhost:4321/exemplo-a/
```

**Backoffice em modo dev:** `pnpm --filter @orakel/backoffice dev`, descomente
`BACKOFFICE_UPSTREAM=host.docker.internal:3000` no `.env.local` e rode
`infra/local/compose.sh up -d caddy`. O `admin.orakel.localhost` passa a apontar para o
`next dev`. Para a visualização na máquina, o mesmo com
`BLOG_PREVIEW_UPSTREAM=host.docker.internal:4321`.

**Builds pelo backoffice:** toda gravação que vai para um site agenda o build dele; depois da
janela (`BUILD_WINDOW_SECONDS`, 30 s no local) o `build-runner` roda o `render` e o `publish` e
`https://<site>.localhost` é atualizado. Em `https://admin.orakel.localhost/sites`, "Publicar
agora" antecipa o build e "Último build" mostra o resultado. Falha permanente (trava de
segurança, orçamento de JS, configuração) pausa o site com o motivo; transitória é repetida até
5 vezes. Acompanhe com `infra/local/compose.sh logs -f build-runner`.

**Publicar à mão e medir:**

```sh
pnpm local:publish exemplo-a   # render + publish sem o backoffice (diagnóstico)
pnpm local:load exemplo-a      # 1000 pageviews de BR, PT, DE e US → ClickHouse
```

**Serviços opcionais:**

```sh
infra/local/compose.sh --profile observability up -d   # GlitchTip e Healthchecks
infra/local/compose.sh --profile lighthouse up -d      # LHCI server
```

Com o GlitchTip, crie um projeto e use o DSN com o host interno em `SENTRY_DSN`
(`http://<chave>@glitchtip:8000/<id>`); com o Healthchecks,
`HEARTBEAT_BASE_URL=http://healthchecks:8000/ping/`. Para ver ou parar, acrescente o
`--profile` ao `ps`, `logs` ou `down`.

**Site de exemplo novo no local:** acrescente-o a `LOCAL_SITES` e `LOCAL_MEDIA_HOSTS`, e os
domínios a `infra/local/seeds/sites.json`; depois `pnpm local:up`.

## Unidades

| Unidade                                              | Pacote                   | O que é                                                               |
| ---------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| [`apps/backoffice`](apps/backoffice)                 | `@orakel/backoffice`     | Next.js: UI, API de exportação; processos worker e build-runner       |
| [`apps/blog`](apps/blog)                             | `@orakel/blog`           | Sites Astro por `SITE_ID` (estático) e visualização SSR               |
| [`apps/blog/worker`](apps/blog/worker)               | `@orakel/blog-worker`    | Worker de borda `/_e/*`: pageviews → Analytics Engine                 |
| [`packages/content-model`](packages/content-model)   | `@orakel/content-model`  | Schemas Zod de conteúdo e configuração; fixtures dos sites de exemplo |
| [`packages/content-client`](packages/content-client) | `@orakel/content-client` | Cliente da API de exportação e loaders do Astro                       |
| [`packages/core`](packages/core)                     | `@orakel/core`           | Rotas, head e JSON-LD, sitemap, RSS, robots, `_redirects`, `_headers` |
| [`packages/tokens`](packages/tokens)                 | `@orakel/tokens`         | Temas DTCG → variáveis CSS e fontes, contraste AA verificado          |
| [`packages/elements`](packages/elements)             | `@orakel/elements`       | Web Components: carrossel, menu, copiar link, compartilhar            |
| [`packages/events`](packages/events)                 | `@orakel/events`         | Formato dos eventos, manifesto e script do navegador                  |
| [`packages/build-contract`](packages/build-contract) | `@orakel/build-contract` | Contrato do volume `/build` (`result.json`, `publish.json`)           |
| [`tooling/build-site`](tooling/build-site)           | `@orakel/build-site`     | Entrypoints `render`, `publish` e `ssr` da imagem `site-builder`      |
| [`infra/local/edge-local`](infra/local/edge-local)   | `@orakel/edge-local`     | Substituto local do deploy na Cloudflare e `ae-sim`                   |

Previstas: `packages/ui` (ilhas React), `adapters/astro` e `apps/generator` (geração com
LLM). Unidade nova: `/scaffold` no caminho dela (ver
[`docs/architecture/overview.md`](docs/architecture/overview.md), "Como criar uma unidade").

## CI e imagens

| Workflow             | Quando                                                         | Faz                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`             | PR e push na `main`                                            | Filtros de caminho; lint, tipos e testes (`turbo --affected`, com ClickHouse para o spike do AE); contrato da API; sites de exemplo (orçamento de JS, axe, paridade); compose e bake; fumaça do `site-builder` |
| `images.yml`         | Push na `main` (backoffice, pacotes, tooling, docker) e manual | `docker buildx bake` → GHCR, tag = SHA do commit                                                                                                                                                               |
| `release.yml`        | Tag `core-vX.Y.Z`                                              | Imagem `site-builder` da release do core                                                                                                                                                                       |
| `e2e.yml`            | Só manual                                                      | E2E completo                                                                                                                                                                                                   |
| `add-to-project.yml` | Issue aberta ou reaberta                                       | Adiciona ao GitHub Project `Workspace`                                                                                                                                                                         |

Branches, commits e releases: [`docs/conventions/git.md`](docs/conventions/git.md).

## Estrutura

| Pasta                | Conteúdo                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/`              | `backoffice`, `blog` (+ `worker`); `generator` previsto                                                                    |
| `packages/`          | Domínio compartilhado: `content-model`, `content-client`, `core`, `tokens`, `elements`, `events`, `build-contract`         |
| `tooling/`           | Configurações compartilhadas (`tsconfig`, `eslint-config`, `prettier-config`, `vitest-config`) e `build-site`              |
| `infra/vps/`         | Compose base (produção) e redes                                                                                            |
| `infra/local/`       | Override local, `Caddyfile`, `access-mock`, `edge-local`, `s3/init.sh`, `clickhouse/init.sql`, `seeds/`, scripts `local:*` |
| `docker/`            | `docker-bake.hcl`, `bake.sh` e o `Dockerfile` do `site-builder`                                                            |
| `.github/workflows/` | CI, imagens, release, E2E                                                                                                  |
| `docs/`              | Arquitetura, convenções, guias e ADRs                                                                                      |

## Problemas comuns

- **`Falta .env.local`:** `cp .env.example .env.local`.
- **`defina <VARIÁVEL>` no compose:** falta a variável no `.env.local`; copie do `.env.example`.
- **`ERR_PNPM_NO_MATURE_MATCHING_VERSION`:** a versão pedida saiu há menos de 24 h; use a
  anterior no `catalog` ou espere.
- **Porta ocupada:** pare o serviço da máquina que usa 5432, 8123, 8333, 8788, 80 ou 443.
- **`local:check` falha em "Serviços":** `infra/local/compose.sh logs <serviço>`. Só
  `backoffice-migrate`, `s3-init` e `glitchtip-db` podem estar parados.
- **Navegador recusa o certificado:** instale a CA do Caddy (veja "Primeira vez").
- **`media.<site>.localhost` não responde:** o site precisa estar em `LOCAL_MEDIA_HOSTS`
  (recrie o `caddy`) e em `LOCAL_SITES` (rode `local:up`).
- **Aviso de plataforma (`linux/amd64`) no `local:up` ou `local:publish`:** imagens de antes do
  build nativo; reconstrua com `pnpm local:images`.
- **Linux: `build-runner` sem acesso ao Docker:** `DOCKER_SOCKET_GID` = gid do grupo `docker`
  (`getent group docker`).

## Documentação

- [`docs/README.md`](docs/README.md) — índice.
- [`docs/architecture/overview.md`](docs/architecture/overview.md) — planos, contratos, mapa
  das unidades.
- [`docs/guides/local-setup.md`](docs/guides/local-setup.md) — ambiente local em detalhe.
- [`docs/decisions/`](docs/decisions) — ADRs (0010–0015: ambiente local).
- Cada unidade tem `README.md` e `docs/` próprios.

**Claude Code:** o repositório já vem com `CLAUDE.md`, `.claude/rules/` e
`.claude/settings.json` (ver [`docs/guides/claude-code.md`](docs/guides/claude-code.md)).
Preferências pessoais vão em `CLAUDE.local.md` e `.claude/settings.local.json`, fora do Git.
