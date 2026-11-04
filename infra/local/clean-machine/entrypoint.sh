#!/usr/bin/env sh
# Sobe o dockerd da máquina limpa e espera o socket antes de rodar o comando.
set -eu
dockerd >/var/log/dockerd.log 2>&1 &
i=0
until docker info >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -le 60 ] || { echo "dockerd não subiu; veja /var/log/dockerd.log" >&2; tail -20 /var/log/dockerd.log >&2; exit 1; }
  sleep 1
done
exec "$@"
