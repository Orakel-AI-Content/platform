#!/usr/bin/env sh
# Compose do ambiente local: base da VPS + override local, com as variáveis de .env.local.
set -eu
cd "$(dirname "$0")/../.."
if [ ! -f .env.local ]; then
  echo "Falta .env.local. Crie a partir do modelo: cp .env.example .env.local" >&2
  exit 1
fi
exec docker compose --env-file .env.local \
  -f infra/vps/compose.yaml \
  -f infra/local/compose.override.yaml "$@"
