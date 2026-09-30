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

[ -f "$ENV_FILE" ] || { echo "Falta $ENV_FILE. Crie a partir do modelo: cp .env.example .env.local" >&2; exit 1; }
