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
pnpm local:up              # sobe Postgres e S3 e roda as migrações
pnpm local:seed            # dados de exemplo
```

## Comandos

| Comando                                                     | O que faz                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                                                  | Todas as unidades em modo dev                               |
| `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` | Pipeline do Turborepo                                       |
| `pnpm format`                                               | Prettier no repositório                                     |
| `pnpm local:up`                                             | Sobe o compose (base + override local) e roda `db:migrate`  |
| `pnpm local:seed`                                           | Roda `db:seed`                                              |
| `pnpm local:down`                                           | Para os containers (mantém os dados)                        |
| `pnpm local:reset`                                          | Para e **apaga os volumes**                                 |
| `pnpm local:images`                                         | Constrói as imagens com as tags de produção (SHA do commit) |
| `pnpm local:e2e`                                            | E2E completo com Playwright                                 |
| `infra/local/compose.sh <args>`                             | Qualquer comando do compose com os arquivos certos          |

## Serviços locais

| Serviço             | Endereço                | Credenciais                                 |
| ------------------- | ----------------------- | ------------------------------------------- |
| Postgres 18.6       | `localhost:5432`        | `POSTGRES_*` do `.env.local`                |
| S3 (SeaweedFS 4.48) | `http://localhost:8333` | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` |

As portas só escutam em `127.0.0.1`.

## Problemas comuns

- **`Falta .env.local`**: `cp .env.example .env.local`.
- **`ERR_PNPM_NO_MATURE_MATCHING_VERSION`**: a versão pedida saiu há menos de 24 h;
  use a anterior no `catalog` ou espere.
- **Porta ocupada**: pare o serviço local que usa 5432 ou 8333.
