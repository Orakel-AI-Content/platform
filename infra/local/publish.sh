#!/usr/bin/env sh
# pnpm local:publish <site> (ADR 0015 da raiz): render e publish local da imagem site-builder
# à mão, nas redes do compose — exatamente o que o build-runner automatiza na L3. Prova a
# cadeia API de exportação → render → edge-local → build-cache. Depois: https://<site>.localhost
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

site="${1:?uso: pnpm local:publish <site>}"
image="$(registry)/site-builder:$(env_or SITE_BUILDER_TAG local)"
volume="orakel-build-$site-$(date +%s)"

docker volume create "$volume" >/dev/null
trap 'docker volume rm -f "$volume" >/dev/null' EXIT
show() { docker run --rm -v "$volume:/build" --entrypoint cat "$image" "/build/$1"; }

echo "render de $site (rede orakel-export)…"
set +e
docker run --rm --network orakel-export -v "$volume:/build" \
  -e SITE_ID="$site" -e SITE_DOMAIN="$site.localhost" -e RELEASE=local \
  -e EXPORT_API_URL=http://backoffice-web:3000 -e EXPORT_BUILD_TOKEN="$(env_value EXPORT_BUILD_TOKEN)" \
  "$image" render
code=$?
set -e
if [ "$code" -ne 0 ]; then
  show result.json
  echo "render saiu com $code (10 permanente, 20 transitória)" >&2
  exit "$code"
fi

echo "publish de $site no edge-local (rede orakel-publish)…"
docker run --rm --network orakel-publish -v "$volume:/build" \
  -e SITE_ID="$site" -e DEPLOY_TARGET=local -e EDGE_LOCAL_URL=http://edge-local:8081 \
  -e S3_ENDPOINT=http://s3:8333 -e S3_ACCESS_KEY_ID="$(env_value S3_ACCESS_KEY_ID)" \
  -e S3_SECRET_ACCESS_KEY="$(env_value S3_SECRET_ACCESS_KEY)" \
  "$image" publish
show publish.json
echo "Publicado: https://$site.localhost"
