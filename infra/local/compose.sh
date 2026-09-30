#!/usr/bin/env sh
# Compose do ambiente local: base da VPS + override local, com as variáveis de .env.local
# (ou de ORAKEL_ENV_FILE, para rodar com outro arquivo — por exemplo, no CI).
set -eu
cd "$(dirname "$0")/../.."
env_file="${ORAKEL_ENV_FILE:-.env.local}"
if [ ! -f "$env_file" ]; then
  echo "Falta $env_file. Crie a partir do modelo: cp .env.example .env.local" >&2
  exit 1
fi
exec docker compose --env-file "$env_file" \
  -f infra/vps/compose.yaml \
  -f infra/local/compose.override.yaml "$@"
