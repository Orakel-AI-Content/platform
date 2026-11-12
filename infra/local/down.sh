#!/usr/bin/env sh
# pnpm local:down / local:reset: derruba a pilha local, prévia incluída.
#
# O container da prévia (orakel-preview-<versão>) é criado pelo build-runner, fora do compose
# (ADR 0024), e não tem os labels do compose: o `compose down` não o vê e, com ele vivo nas
# redes orakel-internal e orakel-export, não consegue apagá-las. Por isso ele sai antes, pelo
# label orakel.role=preview (global no host: duas pilhas locais na mesma máquina não são
# suportadas). Os argumentos vão para o `compose down` (ex.: --volumes --remove-orphans).
set -eu
cd "$(dirname "$0")/../.."
previews=$(docker ps -aq --filter label=orakel.role=preview)
if [ -n "$previews" ]; then
  # shellcheck disable=SC2086 # um id por linha, separados de propósito
  docker rm -f $previews >/dev/null
fi
exec infra/local/compose.sh down "$@"
