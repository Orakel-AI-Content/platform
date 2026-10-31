#!/usr/bin/env sh
# pnpm local:e2e:area <área>[,<área>…] | smoke [argumentos do playwright]: o E2E do Backoffice
# só da área tocada (o arquivo test/e2e/<área>.spec.ts) ou só as jornadas @smoke. Antes de
# abrir o navegador, ocupa uma das E2E_SLOTS vagas (padrão 2) da máquina; com todas ocupadas
# por outras sessões, espera em vez de disputar CPU. No CI, o `telas` roda em todo PR (ci.yml) e
# os @stack, no E2E completo (e2e.yml).
set -eu
cd "$(dirname "$0")/../.."

usage="uso: pnpm local:e2e:area <área>[,<área>…] | smoke [argumentos do playwright]"
areas="${1:?$usage}"
shift

if [ "$areas" = smoke ]; then
  set -- --grep @smoke "$@"
else
  files=""
  for area in $(printf '%s' "$areas" | tr ',' ' '); do
    case "$area" in
      *[!abcdefghijklmnopqrstuvwxyz0123456789-]* | -*) echo "área inválida: $area" >&2; exit 2 ;;
    esac
    [ -f "apps/backoffice/test/e2e/$area.spec.ts" ] || {
      echo "Sem apps/backoffice/test/e2e/$area.spec.ts. Áreas:" >&2
      ls apps/backoffice/test/e2e | sed -n 's/\.spec\.ts$//p' | sed 's/^/  /' >&2
      exit 2
    }
    files="$files test/e2e/$area.spec.ts"
  done
  # shellcheck disable=SC2086 # um caminho por área, sem espaços (validados acima)
  set -- $files "$@"
fi

# Vagas: um diretório por sessão (mkdir é atômico), com o PID de quem o ocupa; vaga de um
# processo que já morreu é liberada.
lock_root="${TMPDIR:-/tmp}/orakel-e2e"
slots="${E2E_SLOTS:-2}"
mkdir -p "$lock_root"
slot=""
waited=0
while [ -z "$slot" ]; do
  i=1
  while [ "$i" -le "$slots" ]; do
    dir="$lock_root/slot-$i"
    if mkdir "$dir" 2>/dev/null; then
      echo $$ >"$dir/pid"
      slot="$dir"
      break
    fi
    owner="$(cat "$dir/pid" 2>/dev/null || true)"
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
      rm -rf "$dir"
      continue
    fi
    i=$((i + 1))
  done
  if [ -z "$slot" ]; then
    [ "$waited" -gt 0 ] || echo "As $slots vagas do E2E estão ocupadas; esperando…" >&2
    waited=$((waited + 1))
    sleep 5
  fi
done
trap 'rm -rf "$slot"' EXIT
trap 'exit 130' INT TERM

# Contra a pilha local (E2E_STACK=1): a camada `telas`, sem Docker, é o padrão do config. Na
# pilha, o `chromium` tem a suíte inteira; o `stack` (só os @stack, do e2e.yml) repetiria testes.
E2E_STACK=1 pnpm --filter @orakel/backoffice exec playwright test --project=chromium "$@"
