#!/usr/bin/env sh
# Ensaia docs/guides/local-setup.md numa máquina limpa simulada em Docker (#563): constrói
# infra/local/clean-machine/, leva o HEAD do repositório (sem node_modules, .env.local nem
# caches) e roda nela, literalmente, os blocos de código das seções "Primeira vez" e "E2E
# completo" do guia, com o dockerd próprio do container (Docker-in-Docker). Imagens, volumes e
# CA nascem e morrem com o container; as portas 80 e 443 são as dele, sem colidir com o stack
# da máquina. Depois do roteiro, confere com o Chromium do Playwright, sem ignorar erros de
# certificado, que https://exemplo-a.localhost responde 200, e imprime as versões e as imagens
# para o registro da execução.
#
# Uso: infra/local/clean-machine.sh [arquivo de log]   (padrão: clean-machine.log)
# CLEAN_MACHINE_KEEP=1 mantém o container (orakel-clean-machine) para inspeção depois de uma
# falha: docker exec -it orakel-clean-machine bash; remova com docker rm -fv orakel-clean-machine.
set -eu
cd "$(dirname "$0")/../.."

log="${1:-clean-machine.log}"
image=orakel-clean-machine:local
name=orakel-clean-machine
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

docker build --tag "$image" infra/local/clean-machine
# Só o que está commitado: o ensaio é do HEAD, como numa máquina que acabou de clonar.
git bundle create "$tmp/repo.bundle" HEAD
cp docs/guides/local-setup.md "$tmp/guia.md"

# Bloco de código da seção ## $1 do guia (o primeiro ```sh depois do título).
cat >"$tmp/run.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
block() {
  awk -v title="## $1" '
    $0 == title { inside = 1; next }
    inside && /^## / { exit }
    inside && /^```sh$/ { code = 1; next }
    code && /^```$/ { exit }
    code { print }
  ' /in/guia.md
}
step() { printf '\n=== %s ===\n' "$1"; }

step "Máquina"
date -u +%Y-%m-%dT%H:%M:%SZ
. /etc/os-release && echo "$PRETTY_NAME ($(uname -m))"
docker version --format 'Docker {{.Server.Version}}'
docker compose version
docker buildx version
echo "Node $(node -v)"

git clone --quiet /in/repo.bundle /work/platform
cd /work/platform
# Numa falha depois do local:up, os logs do compose vão para o log do ensaio, como no e2e.yml.
trap 'status=$?; [ "$status" = 0 ] || [ ! -f .env.local ] || { step "Logs do compose"; infra/local/compose.sh logs --no-color --timestamps --tail 300 build-runner backoffice-worker backoffice-web edge-local || true; }' EXIT
echo "Commit $(git rev-parse HEAD)"

for section in "Primeira vez" "E2E completo"; do
  code=$(block "$section")
  [ -n "$code" ] || { echo "Seção \"$section\" sem bloco sh no guia" >&2; exit 1; }
  step "$section"
  printf '%s\n' "$code"
  bash -ex -c "$code"
done

step "Certificado no Chromium (sem ignoreHTTPSErrors)"
cd apps/backoffice
node --input-type=module -e "
  import { chromium } from '@playwright/test';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const response = await page.goto('https://exemplo-a.localhost/');
  console.log('https://exemplo-a.localhost/ →', response.status());
  await browser.close();
  if (response.status() !== 200) process.exit(1);
"
cd ../..

step "Imagens"
docker images --format '{{.Repository}}:{{.Tag}}' | grep "^${IMAGE_REGISTRY:-ghcr.io/orakel-ai-content}/" | sort
step "Concluído"
SCRIPT

docker rm -fv "$name" >/dev/null 2>&1 || true
keep=$([ "${CLEAN_MACHINE_KEEP:-}" = 1 ] && echo || echo --rm)
# O dockerd do container precisa de --privileged; /var/lib/docker num volume anônimo, que o
# --rm apaga junto.
# shellcheck disable=SC2086
{
  status=0
  docker run $keep --name "$name" --privileged \
    --volume /var/lib/docker \
    --volume "$tmp:/in:ro" \
    "$image" bash /in/run.sh || status=$?
  echo "$status" >"$tmp/status"
} 2>&1 | tee "$log"
status=$(cat "$tmp/status")
[ "$status" = 0 ] && echo "Ensaio verde; log em $log" || echo "Ensaio falhou ($status); log em $log" >&2
exit "$status"
