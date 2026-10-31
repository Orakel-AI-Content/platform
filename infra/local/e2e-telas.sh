#!/usr/bin/env sh
# pnpm local:e2e:telas <área>[,<área>…] [argumentos do playwright]: o E2E de telas do Backoffice
# (projeto `telas`, ADR 0017) só da área tocada, sem build do Next e sem Docker além do Postgres
# do compose. O Playwright sobe o `next dev` do worktree e um access-mock no host.
#
# Ocupa uma das E2E_SLOTS vagas da máquina (as mesmas do local:e2e:area). A vaga N dá o banco
# orakel_e2e_N, o Next na porta 3100+N e o access-mock na 8790+N, então sessões de worktrees
# diferentes rodam juntas (no mesmo worktree, o `next dev` trava o .next/dev). O banco da vaga é
# cópia por TEMPLATE de orakel_e2e_template, que o globalSetup da camada migra e semeia uma vez
# e que é recriado quando a impressão das migrações e das fixtures muda. Na saída (sucesso,
# falha ou Ctrl+C), o banco da vaga é apagado; o template fica.
#
# Num worktree sem .env.local, aponte o da raiz: ORAKEL_ENV_FILE=<raiz>/.env.local. O arquivo
# não é executado: chega ao Playwright pelo --env-file do Node.
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

usage="uso: pnpm local:e2e:telas <área>[,<área>…] [argumentos do playwright]"
areas="${1:?$usage}"
shift
files="$(e2e_area_files "$areas")"

pg_user="$(env_or POSTGRES_USER orakel)"
env_file="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
template=orakel_e2e_template
template_lock="$E2E_LOCKS/template"
db=""
e2e_slot_dir=""

# Sem os NOTICE do Postgres (ex.: DROP … IF EXISTS de um banco que não existe).
psql_postgres() {
  compose exec -T -e PGOPTIONS='-c client_min_messages=warning' postgres \
    psql -v ON_ERROR_STOP=1 -q -U "$pg_user" -d postgres "$@"
}

# DATABASE_URL do arquivo de variáveis, com o banco trocado por $1.
database_url() {
  env_value DATABASE_URL | sed -E "s#/[^/?]*(\\?.*)?\$#/$1\\1#"
}

# Impressão do que vai para o template: migrações, as fixtures exemplo-a/exemplo-b, os domínios
# locais e o globalSetup que o semeia. Muda com o nome ou o conteúdo de qualquer um deles.
template_fingerprint() {
  find apps/backoffice/drizzle apps/backoffice/test/e2e/global-setup.ts \
    packages/content-model/fixtures/v1/exemplo-a.ndjson \
    packages/content-model/fixtures/v1/exemplo-b.ndjson infra/local/seeds/sites.json -type f |
    LC_ALL=C sort | while read -r file; do
    echo "$file"
    cat "$file"
  done | cksum | cut -d ' ' -f 1
}

# O globalSetup da camada (migrações, usuários de teste e fixtures) no template, que depois
# fecha para conexões: o CREATE DATABASE … TEMPLATE exige a origem sem nenhuma. A impressão vai
# por último, para um template que falhou no meio ser recriado pela próxima execução.
create_template() {
  echo "banco $template (migrações e fixtures)…"
  psql_postgres -c "DROP DATABASE IF EXISTS $template WITH (FORCE)" -c "CREATE DATABASE $template"
  template_url="$(database_url "$template")"
  (
    cd apps/backoffice
    DATABASE_URL="$template_url" node --env-file="$env_file" --input-type=module \
      -e "await (await import('./test/e2e/global-setup.ts')).default();"
  )
  psql_postgres -c "ALTER DATABASE $template ALLOW_CONNECTIONS false" \
    -c "COMMENT ON DATABASE $template IS '$1'"
}

# Template em dia e o banco da vaga copiado dele, sob a trava do template: duas sessões não o
# recriam juntas, nem copiam dele enquanto outra o recria. Banco de uma sessão morta que usou a
# mesma vaga é recriado.
prepare_db() {
  waited=0
  until try_lock "$template_lock"; do
    [ "$waited" -gt 0 ] || echo "Outra sessão está preparando o $template; esperando…" >&2
    waited=1
    sleep 1
  done
  fingerprint="$(template_fingerprint)"
  current="$(psql_postgres -tA -c \
    "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '$template'")"
  # if, e não ||: à direita de um || o set -e não vale dentro da função.
  if [ "$current" != "$fingerprint" ]; then create_template "$fingerprint"; fi
  echo "banco $db (cópia de $template)…"
  psql_postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" \
    -c "CREATE DATABASE $db TEMPLATE $template"
  rm -rf "$template_lock"
}

# WITH (FORCE): conexões do `next dev` que ainda não fecharam não impedem o DROP.
cleanup() {
  status=$?
  if [ -n "$db" ]; then
    psql_postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" ||
      echo "Aviso: não consegui apagar o banco $db (o Postgres do compose está no ar?)" >&2
  fi
  if [ "$(cat "$template_lock/pid" 2>/dev/null || true)" = $$ ]; then rm -rf "$template_lock"; fi
  rm -rf "$e2e_slot_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

take_e2e_slot
db="orakel_e2e_$e2e_slot"

compose up --detach --wait postgres
# Os pacotes do workspace que o Backoffice importa já construídos (cache do turbo); o Next não:
# o `next dev` compila cada rota na primeira visita.
pnpm turbo run build --filter='@orakel/backoffice^...' --output-logs=errors-only
prepare_db

# As variáveis do ambiente vencem as do --env-file: banco e portas da vaga.
db_url="$(database_url "$db")"
# shellcheck disable=SC2086 # um caminho por área, sem espaços (validados no e2e_area_files)
(
  cd apps/backoffice
  E2E_DATABASE_URL="$db_url" E2E_TELAS_PORT=$((3100 + e2e_slot)) \
    E2E_ACCESS_PORT=$((8790 + e2e_slot)) node --env-file="$env_file" \
    node_modules/@playwright/test/cli.js test --project=telas $files "$@"
)
