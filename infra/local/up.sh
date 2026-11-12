#!/usr/bin/env sh
# pnpm local:up: sobe a pilha local e aplica as migrações, construindo antes as imagens que
# faltam no host.
#
# Confere as mesmas referências que o compose usa (registry e tags com a variável do shell
# vencendo a do .env.local, e `local` como padrão), para que o e2e.yml, que etiqueta as imagens
# com o SHA e roda o bake antes, não as reconstrua. Faltando qualquer uma, constrói o grupo
# `default` inteiro (o cache do buildx poupa as que já existem). Imagem presente mas
# desatualizada em relação ao código não é detectada: para isso, `pnpm local:images`.
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

registry="${IMAGE_REGISTRY:-$(registry)}"
images="$registry/backoffice:${BACKOFFICE_TAG:-$(env_or BACKOFFICE_TAG local)}
$registry/site-builder:${SITE_BUILDER_TAG:-$(env_or SITE_BUILDER_TAG local)}
$registry/edge-local:${EDGE_LOCAL_TAG:-$(env_or EDGE_LOCAL_TAG local)}"

missing=""
for image in $images; do
  docker image inspect "$image" >/dev/null 2>&1 || missing="$missing $image"
done
if [ -n "$missing" ]; then
  echo "Imagens ausentes no host:$missing. Construindo com docker/bake.sh…" >&2
  docker/bake.sh default
fi

infra/local/compose.sh up --detach --wait --remove-orphans
exec turbo run db:migrate
