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
# No Linux, o docker-socket-proxy precisa do gid do grupo dono do socket (o 0 do .env.example é o
# do Docker Desktop). Sem DOCKER_SOCKET_GID no shell, vale o do socket; o shell tem precedência
# sobre o --env-file.
if [ "$(uname -s)" = Linux ] && [ -z "${DOCKER_SOCKET_GID:-}" ] && [ -S /var/run/docker.sock ]; then
  DOCKER_SOCKET_GID=$(stat -c %g /var/run/docker.sock)
  export DOCKER_SOCKET_GID
fi
exec docker compose --env-file "$env_file" \
  -f infra/vps/compose.yaml \
  -f infra/local/compose.override.yaml "$@"
