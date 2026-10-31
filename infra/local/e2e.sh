#!/usr/bin/env sh
# pnpm local:e2e:area <área>[,<área>…] | smoke [argumentos do playwright]: o E2E do Backoffice
# só da área tocada (o arquivo test/e2e/<área>.spec.ts) ou só as jornadas @smoke. Antes de
# abrir o navegador, ocupa uma das E2E_SLOTS vagas (padrão 2) da máquina; com todas ocupadas
# por outras sessões, espera em vez de disputar CPU. No CI, o `telas` roda em todo PR (ci.yml) e
# os @stack, no E2E completo (e2e.yml).
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

usage="uso: pnpm local:e2e:area <área>[,<área>…] | smoke [argumentos do playwright]"
areas="${1:?$usage}"
shift

if [ "$areas" = smoke ]; then
  set -- --grep @smoke "$@"
else
  files="$(e2e_area_files "$areas")"
  # shellcheck disable=SC2086 # um caminho por área, sem espaços (validados no e2e_area_files)
  set -- $files "$@"
fi

take_e2e_slot
trap 'rm -rf "$e2e_slot_dir"' EXIT
trap 'exit 130' INT TERM

# Contra a pilha local (E2E_STACK=1): a camada `telas`, sem Docker, é o padrão do config. Na
# pilha, o `chromium` tem a suíte inteira; o `stack` (só os @stack, do e2e.yml) repetiria testes.
E2E_STACK=1 pnpm --filter @orakel/backoffice exec playwright test --project=chromium "$@"
