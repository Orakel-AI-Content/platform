#!/usr/bin/env sh
# pnpm local:load [site] (ADR 0015 da raiz; workspace#24 R3): k6 manda PAGEVIEWS (padrão 1000)
# pageviews ao edge-local com países variados e o script confere cada etapa: no ClickHouse,
# que todos chegaram, com sessão só fora do EEE, Reino Unido e Suíça; nas tabelas diárias do
# Postgres, depois da consolidação disparada no backoffice-worker, que o total bate com o
# ClickHouse; e em nenhuma tabela do caminho nem nos logs da carga, o IP do container do k6.
# Precisa do site publicado (pnpm local:publish <site>).
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

site="${1:-exemplo-a}"
count="${PAGEVIEWS:-1000}"
# Prazo para o backoffice-worker terminar a consolidação, em segundos.
wait_seconds="${AGGREGATE_TIMEOUT:-120}"
tz=America/Sao_Paulo
pg_user="$(env_or POSTGRES_USER orakel)"
pg_db="$(env_or POSTGRES_DB orakel)"
k6="orakel-load-$$"

ch() { clickhouse_query "$1"; }
pg() { compose exec -T postgres psql -v ON_ERROR_STOP=1 -qtA -U "$pg_user" -d "$pg_db" -c "$1"; }
fail() { echo "$1" >&2; exit 1; }
trap 'docker rm -f "$k6" >/dev/null 2>&1 || true' EXIT

where="index1 = '$site' AND blob2 = 'pageview'"
before=$(ch "SELECT count() FROM analytics.events WHERE $where")
since=$(ch "SELECT now64(3)")
logs_since=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- Carga ------------------------------------------------------------------------------------
# Em segundo plano, para ler o IP do container na rede do edge-local enquanto ele roda (um
# container parado não tem mais IP).
docker run -d --name "$k6" --network orakel-edge -v "$PWD/infra/local/load:/scripts:ro" \
  -e SITE="$site" -e PAGEVIEWS="$count" -e TARGET=http://edge-local:8080 \
  grafana/k6:2.3.0@sha256:9c2dee7f8ed74d317e4027c06a10f169b625638189de8d4555d0b3486a5aeb34 \
  run --quiet /scripts/pageviews.js >/dev/null
ip=$(docker inspect -f '{{with index .NetworkSettings.Networks "orakel-edge"}}{{.IPAddress}}{{end}}' "$k6")
status=$(docker wait "$k6")
docker logs "$k6"
[ "$status" -eq 0 ] || fail "O k6 saiu com código $status."
[ -n "$ip" ] || fail "Não deu para ler o IP do container do k6."

# --- ClickHouse -------------------------------------------------------------------------------
sleep 3
after=$(ch "SELECT count() FROM analytics.events WHERE $where")
echo "Pontos no ClickHouse: $((after - before)) de $count"
ch "SELECT blob5 AS pais, count() AS pageviews, countIf(blob8 != '') AS com_sessao
    FROM analytics.events WHERE $where AND timestamp >= toDateTime64('$since', 3)
    GROUP BY pais ORDER BY pais FORMAT PrettyCompact"
[ "$((after - before))" -eq "$count" ] || fail "Faltaram pontos."
wrong=$(ch "SELECT count() FROM analytics.events WHERE $where AND timestamp >= toDateTime64('$since', 3)
  AND ((blob5 IN ('PT', 'DE') AND blob8 != '') OR (blob5 IN ('BR', 'US') AND blob8 = ''))")
[ "$wrong" -eq 0 ] || fail "$wrong pontos com sessão fora da regra de região."

# --- Consolidação -----------------------------------------------------------------------------
# O bin só enfileira; o script espera o job (e qualquer outro aggregate-audience criado junto,
# como o do cron) sair de graphile_worker.jobs, que apaga o job ao concluir.
today=$(ch "SELECT toDate(now(), '$tz')")
last_job=$(pg "SELECT coalesce(max(id), 0) FROM graphile_worker.jobs")
compose exec -T backoffice-worker node src/bin/aggregate-audience.ts >/dev/null
jobs="graphile_worker.jobs WHERE task_identifier = 'aggregate-audience' AND id > $last_job"
waited=0
while [ "$(pg "SELECT count(*) FROM $jobs")" -gt 0 ]; do
  error=$(pg "SELECT last_error FROM $jobs AND last_error IS NOT NULL LIMIT 1")
  [ -z "$error" ] || fail "A consolidação da audiência falhou: $error"
  [ "$waited" -lt "$wait_seconds" ] || fail "A consolidação da audiência não terminou em ${wait_seconds}s."
  sleep 1
  waited=$((waited + 1))
done
[ "$(ch "SELECT toDate(now(), '$tz')")" = "$today" ] ||
  fail "O dia de São Paulo virou durante a consolidação; rode de novo."

# --- Tabelas diárias --------------------------------------------------------------------------
# Janela padrão do worker (ontem e hoje de São Paulo). Cada elo confere com o anterior, e o
# ClickHouse já conferiu com o enviado; assim, cargas anteriores no mesmo dia não atrapalham.
from=$(ch "SELECT toDate('$today') - 1")
expected=$(ch "SELECT sum(_sample_interval) FROM analytics.events
  WHERE $where AND toDate(timestamp, '$tz') BETWEEN '$from' AND '$today'")
daily=$(pg "SELECT coalesce(sum(views), 0) FROM audience_daily_site
  WHERE site_id = '$site' AND day BETWEEN '$from' AND '$today'")
echo "Visualizações de $from a $today: $daily nas tabelas diárias, $expected no ClickHouse"
[ "$daily" -eq "$expected" ] || fail "As tabelas diárias não batem com o ClickHouse."

# --- Sem IP -----------------------------------------------------------------------------------
# -w: 172.18.0.5 não casa dentro de 172.18.0.50.
has_ip() { grep -Fwq -- "$ip"; }
if ch "SELECT * FROM analytics.events WHERE timestamp >= toDateTime64('$since', 3)
  FORMAT TabSeparated" | has_ip; then
  fail "O IP do k6 ($ip) apareceu em analytics.events."
fi
for table in audience_daily_site audience_daily_article; do
  if pg "COPY $table TO STDOUT" | has_ip; then
    fail "O IP do k6 ($ip) apareceu em $table."
  fi
done
for service in edge-local backoffice-worker; do
  if compose logs --no-log-prefix --since "$logs_since" "$service" 2>&1 | has_ip; then
    fail "O IP do k6 ($ip) apareceu nos logs do $service."
  fi
done
echo "Nenhum rastro do IP do k6 ($ip) nas tabelas nem nos logs."
echo "Carga ok."
