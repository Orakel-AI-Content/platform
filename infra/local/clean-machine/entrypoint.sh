#!/usr/bin/env sh
# Sobe o dockerd da máquina limpa e espera o socket antes de rodar o comando.
set -eu
# cgroup v2 aninhado, como no entrypoint do docker:dind: tira os processos do cgroup raiz e
# delega os controllers. Sem isso, um container com limite de recursos (os de render e publish
# do build-runner) falha com "cannot enter cgroupv2 ... it is in threaded mode".
if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
  mkdir -p /sys/fs/cgroup/init
  xargs -rn1 </sys/fs/cgroup/cgroup.procs >/sys/fs/cgroup/init/cgroup.procs 2>/dev/null || :
  sed -e 's/ / +/g' -e 's/^/+/' </sys/fs/cgroup/cgroup.controllers >/sys/fs/cgroup/cgroup.subtree_control
fi
dockerd >/var/log/dockerd.log 2>&1 &
i=0
until docker info >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -le 60 ] || { echo "dockerd não subiu; veja /var/log/dockerd.log" >&2; tail -20 /var/log/dockerd.log >&2; exit 1; }
  sleep 1
done
exec "$@"
