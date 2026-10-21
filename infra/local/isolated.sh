#!/usr/bin/env sh
# pnpm local:isolated up <id> [porta] | down <id>: um Backoffice só da sessão, para o E2E de
# sessões em paralelo (worktrees). Constrói a imagem da branch só com a tag do commit (sem
# regravar a "local" do compose), sobe orakel-<id>-web pelo `compose run` (ambiente, redes e
# override do backoffice-web) e um Caddy avulso, orakel-<id>-caddy, com o mesmo login de teste
# em https://admin.orakel.localhost:<porta>. Não toca no backoffice-web nem no caddy do compose;
# banco, S3 e access-mock são os do ambiente compartilhado.
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

usage="uso: pnpm local:isolated up <id> [porta] | down <id>"
verb="${1:?$usage}"
id="${2:?$usage}"
case "$id" in
  *[!abcdefghijklmnopqrstuvwxyz0123456789-]* | -*) echo "id só com letras minúsculas, dígitos e hífen: $id" >&2; exit 2 ;;
esac
web="orakel-$id-web"
caddy="orakel-$id-caddy"

down() { docker rm -f "$web" "$caddy" >/dev/null 2>&1 || true; }

# Primeira porta a partir de $1 que ninguém escuta em 127.0.0.1.
free_port() {
  port="$1"
  while nc -z 127.0.0.1 "$port" >/dev/null 2>&1; do
    port=$((port + 1))
    [ "$port" -lt 8500 ] || { echo "Nenhuma porta livre entre 8400 e 8499" >&2; exit 1; }
  done
  echo "$port"
}

wait_healthy() {
  tries=0
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$web")" = healthy ]; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ] || [ "$(docker inspect -f '{{.State.Running}}' "$web")" != true ]; then
      docker logs --tail 50 "$web" >&2
      echo "$web não ficou saudável" >&2
      down
      exit 1
    fi
    sleep 2
  done
}

# Caddy na porta $1; se outra sessão a pegou entre a busca e o bind, tenta a próxima livre
# (só quando a porta não foi informada).
start_caddy() {
  port="$1"
  echo "$caddy em 127.0.0.1:${port}…"
  until docker run -d --name "$caddy" --network orakel-internal \
    -p "127.0.0.1:$port:$port" \
    -e ISOLATED_PORT="$port" -e BACKOFFICE_UPSTREAM="$web:3000" \
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
  tag="$(git rev-parse HEAD)"
  [ -z "$(git status --porcelain)" ] ||
    echo "Aviso: há mudanças sem commit; a imagem :$tag as inclui." >&2

  # CI=1: o docker-bake.hcl não acrescenta a tag "local".
  echo "imagem backoffice:${tag}…"
  CI=1 IMAGE_REGISTRY="$(registry)" PLATFORM="$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')" \
    docker/bake.sh backoffice --load

  down
  echo "${web}…"
  BACKOFFICE_TAG="$tag" compose run -d --no-deps --name "$web" backoffice-web >/dev/null
  wait_healthy

  # A imagem do caddy do override, presa por digest.
  caddy_image="$(compose config --images caddy | grep '^caddy:')"
  port="${fixed_port:-$(free_port 8400)}"
  start_caddy "$port"

  echo "E2E_BASE_URL=https://admin.orakel.localhost:$port"
}

case "$verb" in
  up) up "${3:-}" ;;
  down) down ;;
  *) echo "$usage" >&2; exit 2 ;;
esac
