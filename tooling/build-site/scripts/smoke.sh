#!/usr/bin/env sh
# Fumaça da imagem site-builder (CI e local): render da fixture exemplo-a num volume, como o
# build-runner faz, e o ssr respondendo. Uso: tooling/build-site/scripts/smoke.sh [imagem]
set -eu
IMAGE="${1:-ghcr.io/orakel-ai-content/site-builder:local}"
ID="orakel-smoke-$$"
TOKEN=smoke-build-token-0000000000000000

cleanup() {
  docker rm -f "$ID-api" "$ID-ssr" >/dev/null 2>&1 || true
  docker volume rm "$ID" >/dev/null 2>&1 || true
  docker network rm "$ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "FUMAÇA FALHOU: $*" >&2; exit 1; }
in_image() {
  entry="$1"
  shift
  docker run --rm --network "$ID" -v "$ID:/build" --entrypoint "$entry" "$IMAGE" "$@"
}
wait_http() {
  in_image node -e "
    const url = process.argv[1];
    (async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(url, { headers: { authorization: 'Bearer $TOKEN' } }); if (r.status === 200) process.exit(0); } catch {} await new Promise((s) => setTimeout(s, 500)); } process.exit(1); })();
  " "$1" || fail "sem resposta 200 de $1"
}

docker network create "$ID" >/dev/null
docker volume create "$ID" >/dev/null

docker run -d --name "$ID-api" --network "$ID" --entrypoint node "$IMAGE" \
  tooling/build-site/scripts/snapshot-server.ts 8080 fixtures >/dev/null
wait_http "http://$ID-api:8080/api/export/v1/sites/exemplo-a/snapshot"

set +e
docker run --rm --network "$ID" -v "$ID:/build" \
  -e SITE_ID=exemplo-a -e SITE_DOMAIN=exemplo-a.com.br -e RELEASE=smoke \
  -e EXPORT_API_URL="http://$ID-api:8080" -e EXPORT_BUILD_TOKEN="$TOKEN" \
  "$IMAGE" render
code=$?
set -e
result=$(in_image cat /build/result.json)
echo "$result"
[ "$code" -eq 0 ] || fail "render saiu com $code"
echo "$result" | grep -q '"status": "ok"' || fail "result.json sem status ok"
echo "$result" | grep -Eq '"pages": [1-9]' || fail "nenhuma página gerada"
in_image cat /build/wrangler.cloudflare.jsonc | grep -q ALLOW_COUNTRY_OVERRIDE \
  && fail "alvo cloudflare com ALLOW_COUNTRY_OVERRIDE"
in_image cat /build/wrangler.local.jsonc | grep -q '"service": "ae-sim"' || fail "alvo local sem ae-sim"
# O publish vai rodar isto de verdade: sem credenciais, o --dry-run valida o alvo e empacota.
in_image sh -c 'cd /build && WRANGLER_SEND_METRICS=false \
  /app/tooling/build-site/node_modules/.bin/wrangler deploy --dry-run --config wrangler.cloudflare.jsonc --outdir /tmp/dry' \
  >/dev/null || fail "wrangler deploy --dry-run do alvo cloudflare falhou"

docker run -d --name "$ID-ssr" --network "$ID" -e CONTENT_SOURCE=fixture -e PORT=4321 "$IMAGE" ssr >/dev/null
wait_http "http://$ID-ssr:4321/exemplo-a/"
echo "Fumaça ok: render, wrangler (dry-run) e ssr"
