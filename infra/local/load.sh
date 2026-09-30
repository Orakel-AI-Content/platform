#!/usr/bin/env sh
# pnpm local:load [site] (ADR 0015 da raiz): k6 manda PAGEVIEWS (padrão 1000) pageviews ao
# edge-local com países variados e confere no ClickHouse que todos chegaram — com sessão só
# fora do EEE, Reino Unido e Suíça. Precisa do site publicado (pnpm local:publish <site>).
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

site="${1:-exemplo-a}"
count="${PAGEVIEWS:-1000}"
ch() { clickhouse_query "$1"; }
where="index1 = '$site' AND blob2 = 'pageview'"
before=$(ch "SELECT count() FROM analytics.events WHERE $where")
since=$(ch "SELECT now64(3)")

docker run --rm --network orakel-edge -v "$PWD/infra/local/load:/scripts:ro" \
  -e SITE="$site" -e PAGEVIEWS="$count" -e TARGET=http://edge-local:8080 \
  grafana/k6:2.3.0@sha256:9c2dee7f8ed74d317e4027c06a10f169b625638189de8d4555d0b3486a5aeb34 \
  run --quiet /scripts/pageviews.js

sleep 3
after=$(ch "SELECT count() FROM analytics.events WHERE $where")
echo "Pontos no ClickHouse: $((after - before)) de $count"
ch "SELECT blob5 AS pais, count() AS pageviews, countIf(blob8 != '') AS com_sessao
    FROM analytics.events WHERE $where AND timestamp >= toDateTime64('$since', 3)
    GROUP BY pais ORDER BY pais FORMAT PrettyCompact"
[ "$((after - before))" -eq "$count" ] || { echo "Faltaram pontos." >&2; exit 1; }
wrong=$(ch "SELECT count() FROM analytics.events WHERE $where AND timestamp >= toDateTime64('$since', 3)
  AND ((blob5 IN ('PT', 'DE') AND blob8 != '') OR (blob5 IN ('BR', 'US') AND blob8 = ''))")
[ "$wrong" -eq 0 ] || { echo "$wrong pontos com sessão fora da regra de região." >&2; exit 1; }
echo "Carga ok."
