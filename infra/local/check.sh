#!/usr/bin/env sh
# pnpm local:check (ADR 0015 da raiz): fumaça do ambiente local — serviços, hostnames pelo
# Caddy, buckets, ClickHouse, isolamento das redes e o proxy do socket do Docker.
set -u
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

failures=0
ok() { printf '  ✓ %s\n' "$1"; }
ko() { printf '  ✗ %s — %s\n' "$1" "$2"; failures=$((failures + 1)); }
expect() { # descrição, obtido, esperado (regex)
  if printf '%s' "$2" | grep -Eq "^($3)$"; then ok "$1"; else ko "$1" "obtido: $2"; fi
}

probe_image="$(registry)/backoffice:$(env_or BACKOFFICE_TAG local)"
# node -e com um fetch/TCP; imprime o status HTTP ou "erro"/"conectou".
probe() { # rede, script
  docker run --rm --network "$1" --entrypoint node "$probe_image" -e "$2" 2>/dev/null || echo erro
}
http() { echo "fetch('$1',{signal:AbortSignal.timeout(4000)}).then(r=>console.log(r.status),()=>console.log('erro'))"; }
tcp() { echo "const s=require('net').connect($2,'$1');s.setTimeout(3000);s.on('connect',()=>{console.log('conectou');s.end()});s.on('error',()=>console.log('erro'));s.on('timeout',()=>{console.log('erro');s.destroy()})"; }

echo "Serviços"
# Sem pipe no laço: num subshell, as falhas não chegariam à contagem final. Campos com |,
# porque Health vem vazio nos serviços sem healthcheck.
# Só estes terminam de propósito; qualquer outro serviço parado é falha.
ONE_SHOT="backoffice-migrate s3-init glitchtip-db"
services=$(compose ps --all --format '{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}')
while IFS='|' read -r service state health exit_code; do
  [ -n "$service" ] || continue
  case "$state" in
    running)
      if [ -z "$health" ] || [ "$health" = healthy ]; then ok "$service"; else ko "$service" "$health"; fi ;;
    exited)
      case " $ONE_SHOT " in
        *" $service "*)
          if [ "$exit_code" = 0 ]; then ok "$service (concluído)"; else ko "$service" "saiu com $exit_code"; fi ;;
        *) ko "$service" "parado" ;;
      esac ;;
    *) ko "$service" "$state" ;;
  esac
done <<EOF_SERVICES
$services
EOF_SERVICES

echo "Hostnames (Caddy)"
status_of() { curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$1"; }
expect "admin.orakel.localhost pede login" "$(status_of https://admin.orakel.localhost/)" '302'
expect "preview.orakel.localhost pede login" "$(status_of https://preview.orakel.localhost/)" '302'
expect "s3.orakel.localhost pede login" "$(status_of https://s3.orakel.localhost/)" '302'
expect "exemplo-a.localhost chega ao edge-local" "$(status_of https://exemplo-a.localhost/)" '200|404'
# O edge-local também responde 404 a host que não conhece: quem atendeu vem do Server.
server_of() { curl -sk -o /dev/null -w '%header{server}' --max-time 10 "$1"; }
for site in $(local_sites); do
  expect "media.$site.localhost chega ao filer" "$(server_of "https://media.$site.localhost/nao-existe.webp")" 'SeaweedFS.*'
done
case "$(server_of https://media.originals.localhost/nao-existe.jpg)" in
  SeaweedFS*) ko "media.originals.localhost fora do filer" "expõe o media-originals" ;;
  *) ok "media.originals.localhost fora do filer" ;;
esac

echo "Certificados (CA interna do Caddy)"
# Nome exato em cada host: o Chrome recusa o curinga *.localhost, que o OpenSSL e o curl aceitam.
names_of() {
  echo | openssl s_client -connect 127.0.0.1:443 -servername "$1" 2>/dev/null |
    openssl x509 -noout -ext subjectAltName 2>/dev/null | tail -1 | tr -d ' '
}
for host in admin.orakel.localhost exemplo-a.localhost media.exemplo-a.localhost; do
  expect "$host com certificado próprio" "$(names_of "$host")" "DNS:$host"
done
# No macOS, a raiz em uso precisa estar no Keychain do sistema (muda a cada local:reset).
if command -v security >/dev/null 2>&1; then
  root=$(compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt |
    openssl x509 -noout -fingerprint -sha256 | sed 's/.*=//; s/://g')
  installed=$(security find-certificate -a -c "Caddy Local Authority" -Z /Library/Keychains/System.keychain 2>/dev/null |
    sed -n 's/^SHA-256 hash: //p')
  case "$installed" in
    *"$root"*) ok "CA atual do Caddy no Keychain do sistema" ;;
    *) ko "CA atual do Caddy no Keychain do sistema" "instale-a (docs/guides/local-setup.md, \"CA local\")" ;;
  esac
fi

echo "Armazenamento e analytics"
buckets=$(compose exec -T s3 sh -c 'echo s3.bucket.list | weed shell -master=localhost:9333 -filer=localhost:8888' 2>/dev/null)
for bucket in media-originals build-cache backups brasil $(local_sites | sed 's/^/media-/'); do
  printf '%s' "$buckets" | grep -qw "$bucket" && ok "bucket $bucket" || ko "bucket $bucket" "não existe"
done
table=$(clickhouse_query 'EXISTS TABLE analytics.events' 2>/dev/null)
expect "ClickHouse: analytics.events" "$table" '1'

echo "Redes"
expect "export → API de exportação" "$(probe orakel-export "$(http http://backoffice-web:3000/api/health)")" '200'
expect "export ↛ Postgres" "$(probe orakel-export "$(tcp postgres 5432)")" 'erro'
expect "export ↛ internet" "$(probe orakel-export "$(http https://www.cloudflare.com/)")" 'erro'
expect "publish → edge-local" "$(probe orakel-publish "$(http http://edge-local:8081/healthz)")" '200'
expect "publish ↛ backoffice" "$(probe orakel-publish "$(http http://backoffice-web:3000/api/health)")" 'erro'

echo "Proxy do socket do Docker (a partir do build-runner)"
proxy() { # método, caminho
  compose exec -T build-runner node -e \
    "fetch('http://docker-socket-proxy:2375$2',{method:'$1'}).then(r=>console.log(r.status),()=>console.log('erro'))" 2>/dev/null
}
expect "GET /version liberado" "$(proxy GET /version)" '200'
expect "POST exec recusado" "$(proxy POST /containers/qualquer/exec)" '403|405'
expect "POST pull recusado" "$(proxy POST /images/create)" '403|405'
expect "GET de redes recusado" "$(proxy GET /networks)" '403|405'

if [ "$failures" -gt 0 ]; then
  echo "$failures verificação(ões) falharam." >&2
  exit 1
fi
echo "Ambiente local ok."
