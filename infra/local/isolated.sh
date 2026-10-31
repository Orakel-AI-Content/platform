#!/usr/bin/env sh
# Legado (ADR 0017): o E2E local de uma área é o `pnpm local:e2e:telas <área>`, sem build nem
# cópia do banco. Este comando sai depois de 2 semanas sem uso.
#
# pnpm local:isolated up <id> [porta] | down <id>: um Backoffice só da sessão, para o E2E de
# sessões em paralelo (worktrees). Sobe o `next start` do worktree no host (build pelo turbo,
# com cache), num banco só da sessão (orakel_<id>, cópia do compartilhado), e um Caddy avulso,
# orakel-<id>-caddy, com o mesmo login de teste em https://admin.orakel.localhost:<porta>. Não
# toca no backoffice-web nem no caddy do compose; S3 e access-mock são os compartilhados.
# PID e log do `next start` ficam em .e2e/<id>/.
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

usage="uso (legado; prefira pnpm local:e2e:telas <área>): pnpm local:isolated up <id> [porta] | down <id>"
verb="${1:?$usage}"
id="${2:?$usage}"
case "$id" in
  *[!abcdefghijklmnopqrstuvwxyz0123456789-]* | -*) echo "id só com letras minúsculas, dígitos e hífen: $id" >&2; exit 2 ;;
esac
caddy="orakel-$id-caddy"
state=".e2e/$id"
pid_file="$state/next.pid"
log="$state/next.log"
pg_user="$(env_or POSTGRES_USER orakel)"
source_db="$(env_or POSTGRES_DB orakel)"
db="orakel_$(printf '%s' "$id" | tr - _)"

# Sem os NOTICE do Postgres (ex.: DROP … IF EXISTS de um banco que não existe).
psql_postgres() {
  compose exec -T -e PGOPTIONS='-c client_min_messages=warning' postgres \
    psql -v ON_ERROR_STOP=1 -q -U "$pg_user" -d postgres "$@"
}

stop_app() {
  [ -f "$pid_file" ] || return 0
  pid="$(cat "$pid_file")"
  if kill "$pid" 2>/dev/null; then
    tries=0
    while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 20 ]; do
      tries=$((tries + 1))
      sleep 0.5
    done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

# WITH (FORCE): conexões do `next start` que ainda não fecharam não impedem o DROP.
drop_db() {
  psql_postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" ||
    echo "Aviso: não consegui apagar o banco $db (o Postgres do compose está no ar?)" >&2
}

# orakel-<id>-web: o container das versões que subiam o Backoffice em Docker.
down() {
  stop_app
  docker rm -f "$caddy" "orakel-$id-web" >/dev/null 2>&1 || true
  drop_db
  rm -rf "$state"
}

# Primeira porta a partir de $1 que ninguém escuta em 127.0.0.1, até $1 + 99.
free_port() {
  port="$1"
  while nc -z 127.0.0.1 "$port" >/dev/null 2>&1; do
    port=$((port + 1))
    [ "$port" -lt $(($1 + 100)) ] || { echo "Nenhuma porta livre entre $1 e $(($1 + 99))" >&2; exit 1; }
  done
  echo "$port"
}

# Cópia por pg_dump | psql, não CREATE DATABASE … TEMPLATE: o banco compartilhado sempre tem
# conexões (backoffice-web, worker, build-runner), e o TEMPLATE exige que não tenha nenhuma.
copy_db() {
  echo "banco $db (cópia de $source_db)…"
  if ! psql_postgres -c "CREATE DATABASE $db" ||
    ! compose exec -T postgres sh -c \
      "set -o pipefail; pg_dump -U '$pg_user' '$source_db' | psql -v ON_ERROR_STOP=1 -q -U '$pg_user' -d '$db'" >/dev/null; then
    echo "Não consegui copiar o banco $source_db para $db (pg_dump | psql no serviço postgres do compose)." >&2
    echo "Confira se o ambiente compartilhado está no ar (pnpm local:up) e rode de novo." >&2
    down
    exit 1
  fi
}

# DATABASE_URL do arquivo de variáveis, com o banco trocado pelo da sessão.
session_database_url() {
  env_value DATABASE_URL | sed -E "s#/[^/?]*(\\?.*)?\$#/$db\\1#"
}

# O `next start` na porta $1, com as variáveis do arquivo (--env-file não sobrescreve as do
# ambiente: DATABASE_URL da sessão e E2E_ERROR_ROUTE, a página /teste-de-erro do E2E).
start_app() {
  : >"$log"
  (
    cd apps/backoffice
    DATABASE_URL="$database_url" E2E_ERROR_ROUTE=1 exec node --env-file="$env_file" \
      node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$1"
  ) >>"$log" 2>&1 &
  echo $! >"$pid_file"
}

# Saudável: o processo da sessão vivo, escutando na porta $1 (não outro que a pegou antes) e
# respondendo em /api/health. Volta 1 se o processo morreu.
wait_healthy() {
  pid="$(cat "$pid_file")"
  tries=0
  until lsof -nP -a -p "$pid" -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1 &&
    curl -fsS -o /dev/null "http://127.0.0.1:$1/api/health"; do
    kill -0 "$pid" 2>/dev/null || return 1
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      tail -n 50 "$log" >&2
      echo "O Backoffice da sessão não respondeu em http://127.0.0.1:$1/api/health" >&2
      down
      exit 1
    fi
    sleep 1
  done
}

# Backoffice na primeira porta livre a partir de 3100; se outra sessão a pegou entre a busca e
# o bind, o processo morre e tenta a próxima.
start_app_on_free_port() {
  app_port="$(free_port 3100)"
  start_app "$app_port"
  until wait_healthy "$app_port"; do
    if ! grep -q EADDRINUSE "$log"; then
      tail -n 50 "$log" >&2
      echo "O Backoffice da sessão parou na partida (log em $log)" >&2
      down
      exit 1
    fi
    app_port="$(free_port $((app_port + 1)))"
    echo "tentando a porta ${app_port}…"
    start_app "$app_port"
  done
}

# Caddy na porta $1; se outra sessão a pegou entre a busca e o bind, tenta a próxima livre
# (só quando a porta não foi informada).
start_caddy() {
  port="$1"
  echo "$caddy em 127.0.0.1:${port}…"
  until docker run -d --name "$caddy" --network orakel-internal \
    --add-host host.docker.internal:host-gateway -p "127.0.0.1:$port:$port" \
    -e ISOLATED_PORT="$port" -e BACKOFFICE_UPSTREAM="host.docker.internal:$app_port" \
    -v "$PWD/infra/local/isolated.Caddyfile:/etc/caddy/Caddyfile:ro" \
    "$caddy_image" >/dev/null; do
    docker rm -f "$caddy" >/dev/null 2>&1 || true
    [ -z "$fixed_port" ] || { down; exit 1; }
    port="$(free_port $((port + 1)))"
    echo "tentando 127.0.0.1:${port}…"
  done
}

up() {
  fixed_port="${1:-}"
  env_file="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
  database_url="$(session_database_url)"

  down
  mkdir -p "$state"
  copy_db

  echo "build do backoffice (cache do turbo)…"
  pnpm turbo run build --filter=@orakel/backoffice --output-logs=errors-only

  echo "backoffice da sessão…"
  start_app_on_free_port

  # A imagem do caddy do override, presa por digest.
  caddy_image="$(compose config --images caddy | grep '^caddy:')"
  port="${fixed_port:-$(free_port 8400)}"
  start_caddy "$port"

  echo "E2E_BASE_URL=https://admin.orakel.localhost:$port"
  echo "E2E_DATABASE_URL=$database_url"
}

case "$verb" in
  up) up "${3:-}" ;;
  down) down ;;
  *) echo "$usage" >&2; exit 2 ;;
esac
