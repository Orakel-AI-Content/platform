#!/usr/bin/env sh
# Funções comuns dos comandos local:* (lidas com `. infra/local/lib.sh`, na raiz do repo).

# Arquivo de variáveis: .env.local, ou ORAKEL_ENV_FILE (o mesmo do compose.sh).
ENV_FILE="${ORAKEL_ENV_FILE:-.env.local}"

# Valor de uma variável do arquivo, sem executá-lo.
env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# Com o padrão do compose quando a variável não está no .env.local.
env_or() { value=$(env_value "$1"); echo "${value:-$2}"; }

registry() { env_or IMAGE_REGISTRY ghcr.io/orakel-ai-content; }

clickhouse_query() {
  infra/local/compose.sh exec -T clickhouse clickhouse-client --user "$(env_or CLICKHOUSE_USER orakel)" \
    --password "$(env_or CLICKHOUSE_PASSWORD orakel-local)" -q "$1"
}

compose() { infra/local/compose.sh "$@"; }

# Travas dos comandos local:e2e*: um diretório por trava (mkdir é atômico), com o PID de quem
# a ocupa.
E2E_LOCKS="${TMPDIR:-/tmp}/orakel-e2e"

# Ocupa a trava $1 com o PID desta sessão; volta 1 se um processo vivo já a tem. A de um
# processo que já morreu é liberada.
try_lock() {
  mkdir -p "$E2E_LOCKS"
  while ! mkdir "$1" 2>/dev/null; do
    owner="$(cat "$1/pid" 2>/dev/null || true)"
    if [ -z "$owner" ] || kill -0 "$owner" 2>/dev/null; then return 1; fi
    rm -rf "$1"
  done
  echo $$ >"$1/pid"
}

# Ocupa uma das E2E_SLOTS vagas do E2E na máquina (padrão 2), divididas entre o local:e2e:area
# e o local:e2e:telas; com todas ocupadas por outras sessões, espera em vez de disputar CPU.
# Define e2e_slot (o número, de 1 a E2E_SLOTS) e e2e_slot_dir; quem chama apaga o diretório na
# saída.
take_e2e_slot() {
  slots="${E2E_SLOTS:-2}"
  waited=0
  while :; do
    e2e_slot=1
    while [ "$e2e_slot" -le "$slots" ]; do
      e2e_slot_dir="$E2E_LOCKS/slot-$e2e_slot"
      try_lock "$e2e_slot_dir" && return 0
      e2e_slot=$((e2e_slot + 1))
    done
    [ "$waited" -gt 0 ] || echo "As $slots vagas do E2E estão ocupadas; esperando…" >&2
    waited=1
    sleep 5
  done
}

# Specs do E2E do Backoffice das áreas $1 (separadas por vírgula): um test/e2e/<área>.spec.ts
# por área, relativo a apps/backoffice. Área inválida ou sem spec sai com 2 e lista as áreas.
e2e_area_files() {
  for area in $(printf '%s' "$1" | tr ',' ' '); do
    case "$area" in
      *[!abcdefghijklmnopqrstuvwxyz0123456789-]* | -*) echo "área inválida: $area" >&2; exit 2 ;;
    esac
    [ -f "apps/backoffice/test/e2e/$area.spec.ts" ] || {
      echo "Sem apps/backoffice/test/e2e/$area.spec.ts. Áreas:" >&2
      ls apps/backoffice/test/e2e | sed -n 's/\.spec\.ts$//p' | sed 's/^/  /' >&2
      exit 2
    }
    printf ' test/e2e/%s.spec.ts' "$area"
  done
}

[ -f "$ENV_FILE" ] || { echo "Falta $ENV_FILE. Crie a partir do modelo: cp .env.example .env.local" >&2; exit 1; }
