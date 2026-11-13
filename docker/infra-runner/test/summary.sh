#!/bin/sh
# Teste do summary.jq (resumo do plano no infra-plan.json): um `tofu show -json` fixo de
# destruição (toda a infra do módulo site em delete) contra o resumo esperado. Roda no job
# `infra` do CI e localmente com `docker/infra-runner/test/summary.sh` (só precisa do jq).
set -eu
dir=$(dirname "$0")
actual=$(jq -c -f "$dir/../summary.jq" "$dir/destroy-plan.json")
expected=$(jq -c . "$dir/destroy-summary.json")
if [ "$actual" != "$expected" ]; then
  echo "summary.jq: o resumo do plano de destruição diverge do esperado" >&2
  printf 'esperado: %s\nobtido:   %s\n' "$expected" "$actual" >&2
  exit 1
fi
echo "summary.jq: resumo do plano de destruição ok ($(printf '%s' "$actual" | jq length) recursos)"
