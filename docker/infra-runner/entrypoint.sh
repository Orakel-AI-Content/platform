#!/bin/sh
# Entrypoint do infra-runner (ADR 0027 da raiz). Contrato do volume em @orakel/build-contract
# (INFRA_DIR, INFRA_PATHS, InfraPlanResultSchema, InfraApplyResultSchema).
#
#   plan    tofu init + plan -json -out=/infra/site.tfplan; resumo em /infra/infra-plan.json
#   apply   tofu init + apply -json /infra/site.tfplan (o plano salvo, tal como foi gerado);
#           saídas em /infra/infra-apply.json e, depois, o Crawler Hints da zona
#
# Entrada só pelo ambiente:
#   SITE_ID, CLOUDFLARE_ACCOUNT_ID, DOMAIN, EMAIL_FORWARD_TO, EMAIL_ALIASES (opcional, JSON)
#   CLOUDFLARE_INFRA_TOKEN, TOFU_STATE_ACCESS_KEY_ID, TOFU_STATE_SECRET_ACCESS_KEY,
#   TOFU_STATE_PASSPHRASE (os segredos de infra que só o build-runner conhece)
#
# Andamento: o JSON por linha do tofu (-json) no stdout. Avisos e erros do próprio script no
# stderr. Saída: 0 ok, 10 falha permanente, 20 transitória; o arquivo de resultado concorda.
# Nenhuma mensagem repete um segredo: as falhas citam só o nome da variável.
set -eu
set -o pipefail

INFRA_DIR=/infra
PLAN="$INFRA_DIR/site.tfplan"
BIN_DIR=$(dirname "$0")
LOG=/tmp/tofu.jsonl
START=$(date +%s)
# Base da API só trocável para o teste local do Crawler Hints; o build-runner não a define.
CF_API=${CLOUDFLARE_API_URL:-https://api.cloudflare.com/client/v4}

cmd=${1:-}
case "$cmd" in
  plan) RESULT="$INFRA_DIR/infra-plan.json" ;;
  apply) RESULT="$INFRA_DIR/infra-apply.json" ;;
  *)
    echo "infra-runner: comando desconhecido '${cmd}'. Use plan ou apply." >&2
    exit 10
    ;;
esac

duration_ms() { echo $((($(date +%s) - START) * 1000)); }

# Grava o resultado de falha e sai com o código do tipo (permanent 10, transient 20).
fail() {
  kind=$1
  message=$2
  jq -n --arg site "${SITE_ID:-desconhecido}" --arg kind "$kind" --arg message "$message" \
    --argjson durationMs "$(duration_ms)" \
    '{formatVersion: 1, status: "failed", site: $site, failure: {kind: $kind, message: $message}, durationMs: $durationMs}' \
    >"$RESULT"
  echo "infra-runner: $message" >&2
  [ "$kind" = transient ] && exit 20
  exit 10
}

# --- Entrada -------------------------------------------------------------------------------
missing=""
for name in SITE_ID CLOUDFLARE_ACCOUNT_ID DOMAIN EMAIL_FORWARD_TO \
  CLOUDFLARE_INFRA_TOKEN TOFU_STATE_ACCESS_KEY_ID TOFU_STATE_SECRET_ACCESS_KEY TOFU_STATE_PASSPHRASE; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || missing="${missing:+$missing, }$name"
done
unset value
[ -z "$missing" ] || fail permanent "Defina $missing no ambiente do infra-runner"

if [ "$cmd" = apply ] && [ ! -s "$PLAN" ]; then
  fail permanent "Sem plano salvo em $PLAN: gere o plano antes do apply"
fi

# Nomes que a raiz infra/site espera (versions.tf). Os originais saem do ambiente do tofu.
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_INFRA_TOKEN"
export AWS_ACCESS_KEY_ID="$TOFU_STATE_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$TOFU_STATE_SECRET_ACCESS_KEY"
export TF_VAR_state_passphrase="$TOFU_STATE_PASSPHRASE"
unset CLOUDFLARE_INFRA_TOKEN TOFU_STATE_ACCESS_KEY_ID TOFU_STATE_SECRET_ACCESS_KEY TOFU_STATE_PASSPHRASE
export TF_VAR_site_id="$SITE_ID"
export TF_VAR_cloudflare_account_id="$CLOUDFLARE_ACCOUNT_ID"
export TF_VAR_domain="$DOMAIN"
export TF_VAR_email_forward_to="$EMAIL_FORWARD_TO"
[ -z "${EMAIL_ALIASES:-}" ] || export TF_VAR_email_aliases="$EMAIL_ALIASES"

# --- Erros do tofu -------------------------------------------------------------------------
# Primeiro diagnóstico de erro do log -json, com qualquer segredo trocado por ***.
tofu_error() {
  jq -rs '
    [.[] | select(.["@level"] == "error")
      | if .diagnostic then
          (.diagnostic.summary + (if (.diagnostic.detail // "") != "" then ": " + .diagnostic.detail else "" end))
        else .["@message"] end]
    | first // "o tofu terminou com erro sem diagnóstico"
    | reduce ($ENV.CLOUDFLARE_API_TOKEN, $ENV.AWS_ACCESS_KEY_ID, $ENV.AWS_SECRET_ACCESS_KEY,
              $ENV.TF_VAR_state_passphrase) as $s (.; split($s) | join("***"))
    | gsub("\\s+"; " ") | .[0:500]
  ' "$LOG" 2>/dev/null || echo "o tofu terminou com erro"
}

# Falha de rede, limite ou 5xx da API: transitória (uma nova execução resolve). O resto,
# permanente. Plano desatualizado: permanente, com o pedido de um plano novo.
tofu_fail() {
  step=$1
  message=$(tofu_error)
  case "$message" in
    *"Saved plan is stale"* | *"plan is stale"*)
      fail permanent "O estado do site mudou depois do plano: gere um novo plano ($message)"
      ;;
  esac
  if printf '%s' "$message" | grep -Eiq 'timeout|timed out|connection|connect:|no such host|rate limit|too many requests|429|50[0-9]|temporar|state lock'; then
    fail transient "Falha no $step: $message"
  fi
  fail permanent "Falha no $step: $message"
}

# Roda um subcomando do tofu com o andamento -json no stdout e uma cópia para ler os erros. O
# -json vem antes dos argumentos posicionais (o plano), senão o tofu não o lê como opção.
run_tofu() {
  sub=$1
  shift
  if ! tofu "$sub" -json "$@" 2>&1 | tee "$LOG"; then
    tofu_fail "$sub"
  fi
}

# --- Comandos ------------------------------------------------------------------------------
# Backend real (R2): a chave do estado sai de var.site_id (avaliação antecipada).
run_tofu init -input=false -reconfigure -lockfile=readonly

if [ "$cmd" = plan ]; then
  rm -f "$PLAN"
  run_tofu plan -input=false -out="$PLAN"
  if ! changes=$(tofu show -json "$PLAN" | jq -c -f "$BIN_DIR/summary.jq"); then
    fail permanent "Não foi possível ler o plano salvo"
  fi
  jq -n --arg site "$SITE_ID" --argjson changes "$changes" --argjson durationMs "$(duration_ms)" \
    '{formatVersion: 1, status: "ok", site: $site, changes: $changes, durationMs: $durationMs}' \
    >"$RESULT"
  exit 0
fi

run_tofu apply -input=false "$PLAN"
if ! outputs=$(tofu output -json); then
  fail transient "O apply terminou, mas as saídas não foram lidas: rode de novo"
fi
zone_id=$(printf '%s' "$outputs" | jq -r '.zone_id.value // empty')
name_servers=$(printf '%s' "$outputs" | jq -c '.name_servers.value // []')
[ -n "$zone_id" ] || fail permanent "O apply terminou sem a saída zone_id"

# Crawler Hints (ADR 0027): a rota de flags da zona não é documentada, então a falha não
# derruba o apply; vira crawlerHints=falhou e a pessoa operadora liga no painel. O token vai
# pelo stdin do curl, nunca na linha de comando.
crawler_hints=falhou
if response=$(printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" |
  curl --silent --show-error --max-time 30 --config - -X POST \
    -H 'Content-Type: application/json' \
    --data '{"feature":"crawlhints_enabled","value":true}' \
    "$CF_API/zones/$zone_id/flags/products/cache/changes" 2>&1) &&
  [ "$(printf '%s' "$response" | jq -r '.success // false' 2>/dev/null)" = true ]; then
  crawler_hints=ligado
else
  echo "infra-runner: Crawler Hints não ligado pela API; ligue em Caching → Configuration → Crawler Hints." >&2
fi

jq -n --arg site "$SITE_ID" --arg zoneId "$zone_id" --argjson nameServers "$name_servers" \
  --arg crawlerHints "$crawler_hints" --argjson durationMs "$(duration_ms)" \
  '{formatVersion: 1, status: "ok", site: $site, nameServers: $nameServers, zoneId: $zoneId, crawlerHints: $crawlerHints, durationMs: $durationMs}' \
  >"$RESULT"
