#!/usr/bin/env sh
# Constrói um grupo de docker/docker-bake.hcl com as tags de produção.
# Uso: docker/bake.sh [grupo] [argumentos extras do bake, ex.: --push]
# Grupo ainda não definido (nenhuma unidade com imagem) = nada a construir.
set -eu
cd "$(dirname "$0")/.."
group="${1:-default}"
[ "$#" -gt 0 ] && shift
export TAG="${TAG:-$(git rev-parse HEAD)}"
if ! out=$(docker buildx bake --file docker/docker-bake.hcl --print "$group" 2>&1); then
  if printf '%s' "$out" | grep -q 'failed to find target'; then
    echo "Grupo '$group' sem alvos em docker/docker-bake.hcl — nada a construir."
    exit 0
  fi
  printf '%s\n' "$out" >&2
  exit 1
fi
exec docker buildx bake --file docker/docker-bake.hcl "$group" "$@"
