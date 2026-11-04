# 0018 – ClickHouse local também na rede internal

- Status: aceito
- Data: 2026-11-04

## Contexto

A consolidação horária da audiência (#547) roda no `backoffice-worker` e lê o Analytics Engine
por SQL. No local, o AE é o ClickHouse (ADR 0014), que até aqui só estava na `orakel-edge`
(ADR 0010), fora do alcance do worker.

## Decisão

No override local, o `clickhouse` entra também na `orakel-internal`, e o `backoffice-worker`
recebe `AE_SQL_TRANSPORT=clickhouse` e `AE_SQL_URL` com `clickhouse:8123`. O worker não entra na
`orakel-edge`: lá ele alcançaria o `edge-local`, que não é dele.

## Consequências

- `pnpm local:check` confere que o worker alcança o ClickHouse e que a `orakel-export` não o
  alcança.
- Em produção não há ClickHouse: o worker consulta a SQL API do AE pela internet (transporte
  `cloudflare`, ainda não implementado). Sem `AE_SQL_*`, a consolidação só avisa.
