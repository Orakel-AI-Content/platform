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
- [Versão do site-builder e builds](#versão-do-site-builder-e-builds)
- [Endereços e acessos](#endereços-e-acessos)
- [Problemas comuns](#problemas-comuns)
- [Unidades](#unidades)
- [Documentação](#documentação)

## Pré-requisitos

| Ferramenta | Versão              | Observação                                                    |
| ---------- | ------------------- | ------------------------------------------------------------- |
| Node       | 22+ (para o pnpm)   | Os scripts baixam e usam o **Node 24.21.0** fixado (`.nvmrc`) |
| pnpm       | 11, via Corepack    | `corepack enable`; a versão vem de `packageManager`           |
| Docker     | Compose v2 e Buildx | Docker Desktop no macOS ou Docker Engine no Linux             |

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
O E2E do Backoffice cobre só fluxos críticos (ADR 0019); tela nova ganha teste de componente.
Argumentos extras vão para o Playwright.

### Imagens Docker

| Quero…                                               | Comando                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Construir um grupo de imagens                        | `docker/bake.sh [images\|release\|local\|default]`               |
| Construir uma imagem só                              | `docker buildx bake --file docker/docker-bake.hcl <alvo>`        |
| Lint, tipos e testes de um pacote em container limpo | `docker buildx bake --file docker/docker-bake.hcl <pacote>-test` |
| Fumaça da imagem `site-builder`                      | `tooling/build-site/scripts/smoke.sh`                            |

`PLATFORM=linux/amd64` força a arquitetura da VPS (o padrão local é a da máquina).

## Versão do site-builder e builds

O porquê dos nomes e das regras está no
[ADR 0018](docs/decisions/0018-versao-do-site-builder.md); o funcionamento dos builds no
ambiente local, em [`local-setup.md`](docs/guides/local-setup.md#builds).

### O que é o `site-builder`

É a imagem Docker que transforma o conteúdo do Backoffice em site: `render` gera o site
estático, `publish` o envia para o alvo de deploy e `ssr` serve a visualização. Existe **uma
imagem para todos os sites**; quem a executa é o `build-runner`, uma vez para cada site.

### Imagem × build

- **Versão do site-builder:** a versão do gerador, compartilhada. Vários sites podem estar na
  mesma versão, e cada site guarda qual usa.
- **Build:** uma execução da imagem para **um** site. Cada site tem fila própria (um build por
  vez), histórico próprio (tabela `builds`), deploy próprio e rollback próprio.

Trocar a versão de um site não mexe nos outros; publicar um site não reconstrói os outros.

### As três formas da versão

Uma versão tem sempre o mesmo `X.Y.Z`, escrito de três jeitos:

| Onde aparece             | Forma                                          | Exemplo                                        |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| Tag Git (o CI cria)      | `site-builder-vX.Y.Z`                          | `site-builder-v1.2.0`                          |
| Imagem (o CI publica)    | `ghcr.io/orakel-ai-content/site-builder:X.Y.Z` | `ghcr.io/orakel-ai-content/site-builder:1.2.0` |
| Backoffice (`/releases`) | `X.Y.Z`, igual à tag da imagem, sem prefixo    | `1.2.0`                                        |

O cadastro em `/releases` só aceita `X.Y.Z`: colar a tag Git (`site-builder-v1.2.0`) dá erro.

### Passo a passo de uma versão nova

1. **Peça a versão** em `/releases` → "Gerar nova versão", escolhendo correção, melhoria ou
   mudança grande: o Backoffice propõe o número `X.Y.Z` (o próximo depois da maior versão já
   pedida) e grava a release em "gerando". Não há campo para digitar o número.
2. **Acompanhe na coluna "Estado"**, que se atualiza sozinha: o Backoffice dispara o
   `release.yml` na `main` com esse número (etapa 1 de 3) e, com o CI verde, baixa a imagem no
   host onde o `build-runner` roda (etapa 2 de 3) até "Disponível". O link "Ver run" abre o run
   no GitHub. Merge na `main` não cria versão, e push de tag não dispara nada: não crie a tag à
   mão.
3. **O `release.yml` roda:** recusa número fora do formato `X.Y.Z` ou já usado, confere que o
   último E2E completo da `main` terminou verde e, só então, publica a imagem
   `site-builder:X.Y.Z` no GHCR e cria a tag `site-builder-vX.Y.Z`. Se o E2E estiver vermelho
   (ou não houver run concluído), ele se recusa, nada é publicado e nenhuma tag é criada.
4. **Se falhar**, a linha fica em "Falhou" com o motivo: corrija a causa (a `main`, por
   exemplo) e use "Tentar de novo", que retoma a etapa que falhou com o mesmo número. Uma versão
   que nenhum site usa pode ser descartada ("Descartar"); o número dela não volta a ser usado.
5. **Mova um site primeiro:** em `/sites/<site>`, "Escolher outra versão do motor" e escolha `X.Y.Z`.
6. **Observe** o resultado do build ("Último build" em `/sites`, logs do `build-runner`) e o
   site no ar; estando tudo certo, mova os demais, um por um.

### Quando usar cada ação

Todas ficam em `/sites/<site>`.

| Quero…                                                        | Ação                             | O que acontece                                                                      |
| ------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| Trocar a versão do gerador de um site, ou voltar a uma antiga | "Escolher outra versão do motor" | Grava a versão no site, retoma o site se pausado e faz um build novo já             |
| Desfazer a última troca de versão do gerador                  | "Voltar à versão anterior (X)"   | Igual ao anterior, na versão de onde o site veio; só aparece se ela está disponível |
| Voltar o site no ar a uma versão publicada antes (rollback)   | "Reverter"                       | Reativa um deploy anterior, **sem rebuild**; a versão do gerador não muda           |
| Publicar já o que mudou, sem esperar a janela de agrupamento  | "Publicar agora"                 | Antecipa o build na versão atual do site (não aparece com o site pausado)           |

Regra prática: o problema veio com a versão nova do gerador → "Voltar à versão anterior". O problema veio com um conteúdo publicado → "Reverter" enquanto corrige.

### Comandos úteis

| Quero…                                                                      | Comando                                                                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Criar uma versão nova do site-builder (dispara o `release.yml`)             | `gh workflow run release.yml --ref main -f version=X.Y.Z`                                                  |
| Reconstruir as imagens locais depois de mudar o gerador                     | `pnpm local:images`                                                                                        |
| Construir só a imagem `site-builder`, como o CI faz                         | `docker/bake.sh release`                                                                                   |
| Conferir se a imagem `site-builder` gera e serve um site                    | `tooling/build-site/scripts/smoke.sh [imagem]`                                                             |
| Subir o ambiente local                                                      | `pnpm local:up`                                                                                            |
| Criar os sites de exemplo e os usuários de teste                            | `pnpm local:seed`                                                                                          |
| Conferir se o ambiente está saudável antes de testar um build               | `pnpm local:check`                                                                                         |
| Publicar um site direto, sem passar pelo Backoffice                         | `pnpm local:publish <site>`                                                                                |
| Ver os builds rodando (e por que um falhou)                                 | `infra/local/compose.sh logs -f build-runner`                                                              |
| Testar o "Escolher outra versão do motor" no local, sem publicar uma versão | `docker tag ghcr.io/orakel-ai-content/site-builder:local ghcr.io/orakel-ai-content/site-builder:X.Y.Z` (¹) |

(¹) Cria no host local a imagem `X.Y.Z` a partir da que o `pnpm local:images` construiu; depois
registre `X.Y.Z` em `/releases` e use "Escolher outra versão do motor" num site. Nada vai para o GHCR.

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
| Linux: `build-runner` sem acesso ao Docker | O `compose.sh` usa o gid de `/var/run/docker.sock`; outro: `DOCKER_SOCKET_GID` no shell   |

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
