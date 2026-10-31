# Ambiente local

Consulte para preparar a máquina e subir o ambiente local ponta a ponta.

## Pré-requisitos

- **Node 22+** para rodar o pnpm. O pnpm baixa e usa o **Node 24.21.0** fixado
  (`devEngines.runtime`) nos scripts do projeto; com nvm, `nvm use` lê o `.nvmrc`.
- **pnpm 11** via Corepack: `corepack enable` (a versão vem de `packageManager`).
- **Docker** com Compose v2 e Buildx.

## Primeira vez

```sh
corepack enable
pnpm install               # instala e ativa os git hooks (lefthook)
cp .env.example .env.local # valores locais; nunca commite .env.local
pnpm local:images          # constrói as imagens (backoffice, site-builder, edge-local)
pnpm local:up              # sobe o compose, cria os buckets e roda as migrações
pnpm local:seed            # usuários de teste, sites de exemplo e o Horta em Casa (<site>.localhost)
pnpm local:trust           # CA do Caddy no Keychain do sistema (macOS; pede a senha)
pnpm local:check           # confere serviços, hostnames, buckets, redes e o proxy do socket
pnpm local:publish exemplo-a   # render + publish no edge-local → https://exemplo-a.localhost
pnpm local:publish horta-em-casa   # o blog completo de demonstração
```

O seed cria, se ainda não existirem: os usuários de teste, `exemplo-a` e `exemplo-b` (das
fixtures do `content-model`; os E2E dependem deles) e cada site completo de
`infra/local/seeds/<site>/` — hoje o **Horta em Casa** (`horta-em-casa`), com 10 artigos,
autores, taxonomias, menus e ilustrações de verdade em `imagens/`. As imagens passam pela
mesma normalização e pelas mesmas variantes de um envio e vão para `media-<site>`; por isso o
site precisa estar em `LOCAL_SITES` e `LOCAL_MEDIA_HOSTS`. Site que já existe é pulado: para
recriar, remova-o do banco (ou `pnpm local:reset`) e rode o seed de novo.

Já tinha um `.env.local`? Compare com o `.env.example` e acrescente as variáveis novas
(backoffice, Access local e o bloco "Ambiente local"); o compose avisa qual falta. Apague ou
comente `BLOG_PREVIEW_UPSTREAM`: sem ela, `preview.orakel.localhost` vai para o container
`blog-preview`. No Linux, `DOCKER_SOCKET_GID` é o gid do grupo `docker` (`getent group docker`).

Outro arquivo de ambiente (ex.: uma cópia do `.env.example` para testar):
`ORAKEL_ENV_FILE=/caminho/env pnpm local:check` — vale para o `compose.sh` e os scripts.

**CA local do Caddy:** o Caddy emite os certificados dos hosts `.localhost` com uma CA
interna, criada no primeiro `local:up` e guardada no volume `caddy-data`. Para o navegador
confiar, instale a raiz dela no Keychain do sistema (macOS; pede a senha):

```sh
pnpm local:trust
```

Repita depois de cada `pnpm local:reset`: o volume é recriado e a CA muda. Todas as raízes do
Caddy têm o mesmo nome; o comando troca pela impressão digital, remove as antigas e avisa se a
atual já está instalada. Feche o Chrome por completo (⌘Q) depois. O `pnpm local:check` acusa
quando a raiz instalada não é a em uso. No Linux, o comando mostra como importar no navegador.

Depois, `https://admin.orakel.localhost` abre o Backoffice; o login de teste (access-mock)
oferece um usuário por papel.

**Backoffice em modo dev:** `pnpm --filter @orakel/backoffice dev` na máquina e
`BACKOFFICE_UPSTREAM=host.docker.internal:3000` no `.env.local` (recrie o `caddy`: `infra/local/compose.sh up -d caddy`), para
o `admin.orakel.localhost` apontar para o `next dev`.

## Sessões em paralelo

O `backoffice-web` e o Caddy do compose são um só para todas as sessões: recriá-los com a
imagem de uma branch troca o Backoffice que as outras estão testando, e o `local:images`
regrava a tag `local`. Uma tarefa fica pronta sem E2E (`lint`, `typecheck`, `test`,
`test:browser` e, se tocar o domínio, `test:contract`; ADR 0017). O E2E local é opcional e só
na camada de telas, a partir do worktree:

```sh
pnpm local:e2e:telas sites,header      # num worktree sem .env.local:
ORAKEL_ENV_FILE=<raiz>/.env.local pnpm local:e2e:telas sites
```

- **Sem build nem Docker a mais:** sobe só o `postgres` do compose (se não estiver no ar) e
  constrói os pacotes do workspace que o Backoffice importa (cache do turbo). O Playwright sobe
  o `next dev` do worktree, que compila cada rota na primeira visita, e um access-mock no host.
  O `.env.local` não é executado: chega ao Playwright pelo `--env-file` do Node.
- **Vagas:** antes de abrir o navegador, ocupa uma das `E2E_SLOTS` vagas da máquina (padrão
  2), as mesmas do `local:e2e:area`; com todas ocupadas, espera. A vaga N tem o banco
  `orakel_e2e_N`, o Next na porta 3100+N e o access-mock na 8790+N. Cada execução usa
  `E2E_WORKERS` workers (padrão 2). Uma execução por worktree: o `next dev` trava o
  `.next/dev`, e a segunda sai com "Another next dev server is already running".
- **Banco da sessão:** cópia por `CREATE DATABASE … TEMPLATE orakel_e2e_template`. O template
  é um banco próprio (o TEMPLATE exige a origem sem conexões, e o compartilhado sempre tem),
  semeado pelo `globalSetup` da camada (migrações, usuários de teste, `exemplo-a` e
  `exemplo-b`) e depois fechado para conexões. A impressão das migrações, das fixtures, de
  `infra/local/seeds/sites.json` e do `globalSetup` fica no comentário do template; quando
  muda, a execução seguinte o recria. Na saída (sucesso, falha ou Ctrl+C), o banco da vaga é
  apagado; o template fica.
- Só a área tocada, nunca a suíte inteira: as telas rodam no PR (job `e2e-telas`) e a pilha
  completa, fora dele (`e2e.yml`). Argumentos a mais vão para o Playwright (ex.: `--list`,
  `-g <título>`).

Contra a pilha local (`E2E_STACK=1`, com o ambiente compartilhado no ar):

- `pnpm local:e2e:area <área>[,<área>…]` roda `apps/backoffice/test/e2e/<área>.spec.ts` no
  projeto `chromium`; `pnpm local:e2e:area smoke` roda as jornadas marcadas com `@smoke` (uma
  por área). Ocupa uma das mesmas vagas.
- Os testes `@perf` (listas com 2.000 linhas e metas de tempo) ficam no projeto Playwright
  `perf`, que só existe no CI; localmente, com `E2E_PERF=1`.

### Legado: `pnpm local:isolated`

Substituído pelo `local:e2e:telas` (ADR 0017); sai depois de 2 semanas sem uso. Sobe um par
só da sessão, com o ambiente compartilhado no ar:

```sh
pnpm local:isolated up 433     # legado; imprime E2E_BASE_URL e E2E_DATABASE_URL
E2E_BASE_URL=https://admin.orakel.localhost:<porta> \
  E2E_DATABASE_URL=postgres://…/orakel_433 pnpm local:e2e:area sites,header
pnpm local:isolated down 433   # legado
```

O `<id>` (letras minúsculas, dígitos e hífen) dá nome ao banco `orakel_<id>` (cópia do
compartilhado por `pg_dump | psql`) e ao container `orakel-<id>-caddy`. O `up` roda o
`next build` pelo turbo e o `next start` na primeira porta livre a partir de 3100 (PID e log em
`.e2e/<id>/`), e um Caddy avulso na primeira porta livre a partir de 8400, com CA própria. O
`down` encerra o `next start`, remove o Caddy e apaga o banco. Não há worker nem build-runner da
sessão. Num worktree sem `.env.local`, aponte o da raiz (legado):
`ORAKEL_ENV_FILE=<raiz>/.env.local pnpm local:isolated up <id>` (legado).

## Comandos

| Comando                                                     | O que faz                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                                                  | Todas as unidades em modo dev                                |
| `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` | Pipeline do Turborepo                                        |
| `pnpm format`                                               | Prettier no repositório                                      |
| `pnpm local:up`                                             | Sobe o compose (base + override local) e roda `db:migrate`   |
| `pnpm local:check`                                          | Confere o ambiente; sai com 1 se algo falhar                 |
| `pnpm local:publish <site>`                                 | `render` (rede export) + `publish` (rede publish) no edge    |
| `pnpm local:load [<site>]`                                  | Carga k6 com países variados; confere no ClickHouse          |
| `pnpm local:trust`                                          | Instala a CA atual do Caddy no Keychain (macOS)              |
| `pnpm local:seed`                                           | Roda `db:seed` (usuários, exemplos e `infra/local/seeds/`)   |
| `pnpm local:down`                                           | Para os containers (mantém os dados)                         |
| `pnpm local:reset`                                          | Para e **apaga os volumes**                                  |
| `pnpm local:images`                                         | Constrói as imagens com as tags de produção (SHA do commit)  |
| `pnpm local:e2e`                                            | E2E completo com Playwright                                  |
| `pnpm local:e2e:telas <área>`                               | E2E de telas de uma área, sem build, numa das vagas          |
| `pnpm local:e2e:area <área>` · `smoke`                      | E2E de uma área ou só os `@smoke`, numa das vagas da máquina |
| `pnpm local:isolated up <id>` · `down <id>` (legado)        | Backoffice no host, banco e Caddy só da sessão               |
| `infra/local/compose.sh <args>`                             | Qualquer comando do compose com os arquivos certos           |

## Serviços locais

| Serviço              | Endereço                                            | Credenciais                                          |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Postgres 18.6        | `localhost:5432`                                    | `POSTGRES_*` do `.env.local`                         |
| S3 (SeaweedFS 4.48)  | `http://localhost:8333`                             | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`          |
| Console do S3        | `https://s3.orakel.localhost`                       | Login de teste do access-mock                        |
| Backoffice           | `https://admin.orakel.localhost`                    | Login de teste do access-mock (um usuário por papel) |
| Visualização         | `https://preview.orakel.localhost/<site>/<caminho>` | Login de teste do access-mock                        |
| Sites publicados     | `https://<site>.localhost`                          | Público (edge-local)                                 |
| Mídia dos sites      | `https://media.<site>.localhost`                    | Público, só leitura (filer do SeaweedFS)             |
| ClickHouse (AE)      | `http://localhost:8123`                             | `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD`            |
| access-mock (Access) | `http://localhost:8788`                             | JWKS em `/cdn-cgi/access/certs`                      |
| Caddy (Tunnel)       | portas 80 e 443                                     | CA interna (veja "Primeira vez")                     |

As portas só escutam em `127.0.0.1`. Buckets (criados pelo `s3-init` a cada `local:up`):
`media-originals`, `build-cache`, `backups`, `brasil` e `media-<site>` de `LOCAL_SITES`.

## Builds

O `build-runner` constrói e publica sozinho: toda gravação que vai para um site agenda o build,
que roda depois de `BUILD_WINDOW_SECONDS` (30 s no local). Em
`https://admin.orakel.localhost/sites`, "Publicar agora" antecipa e "Último build" mostra o
resultado. Falha permanente pausa o site (motivo na coluna Estado); transitória é repetida até
5 vezes. Logs: `infra/local/compose.sh logs -f build-runner`; histórico: tabela `builds`. A
imagem usada é `site-builder:<release do site>` ou, antes da primeira promoção,
`site-builder:local` (do `pnpm local:images`). Detalhes: ADR 0008 do backoffice.

## Redes

`orakel-internal` (serviços da VPS), `orakel-export` (API de exportação, `blog-preview` e
`render`; sem internet), `orakel-publish` (`publish`, `edge-local`, S3), `orakel-docker`
(`build-runner` e `docker-socket-proxy`) e `orakel-edge` (Caddy, `edge-local`, ClickHouse, S3).
Detalhes no ADR 0010; o proxy do socket, no ADR 0011.

## Serviços opcionais

```sh
infra/local/compose.sh --profile observability up -d   # GlitchTip e Healthchecks
infra/local/compose.sh --profile lighthouse up -d      # LHCI server
```

| Serviço      | Endereço                             | Uso                                                            |
| ------------ | ------------------------------------ | -------------------------------------------------------------- |
| GlitchTip    | `https://glitchtip.orakel.localhost` | Crie conta e projeto; `SENTRY_DSN` com o host `glitchtip:8000` |
| Healthchecks | `https://hc.orakel.localhost`        | `HEARTBEAT_BASE_URL` com `http://healthchecks:8000/ping/`      |
| LHCI server  | `https://lhci.orakel.localhost`      | Relatórios do Lighthouse da promoção de release                |

Para ver ou desligar: acrescente o `--profile` ao `ps`, `logs` ou `down`.

## Problemas comuns

- **`Falta .env.local`**: `cp .env.example .env.local`.
- **`ERR_PNPM_NO_MATURE_MATCHING_VERSION`**: a versão pedida saiu há menos de 24 h;
  use a anterior no `catalog` ou espere.
- **Porta ocupada**: pare o serviço local que usa 5432, 8123 ou 8333.
- **`local:check` falha em "Serviços"**: `infra/local/compose.sh logs <serviço>`. Um serviço
  parado só é aceito se for one-shot (`backoffice-migrate`, `s3-init`, `glitchtip-db`).
- **`media.<site>.localhost` não responde**: o site precisa estar em `LOCAL_MEDIA_HOSTS`
  (recrie o `caddy`: `infra/local/compose.sh up -d caddy`) e em `LOCAL_SITES` (rode `local:up` para criar o bucket).
- **Aviso de plataforma (`linux/amd64`) no `local:up` ou `local:publish`**: imagens de antes
  do build nativo; reconstrua com `pnpm local:images` (usa a arquitetura da máquina; o CI
  constrói amd64, a da VPS). Para testar amd64 no local: `PLATFORM=linux/amd64 pnpm local:images`.
