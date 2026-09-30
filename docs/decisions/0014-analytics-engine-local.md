# 0014 – Analytics Engine local no ClickHouse

- Status: aceito
- Data: 2026-09-30

## Contexto

O Worker do blog grava pageviews no Analytics Engine; o agregador os lê pela SQL API. Spike da
L0: as consultas rodam iguais no ClickHouse? O `writeDataPoint` por service binding funciona
sem esperar a resposta? _Fallback:_ tabela no Postgres.

## Decisão

- ClickHouse 25.8.33.6 (tag + digest), banco `analytics`, tabela `events` com o layout do
  dataset do AE (`infra/local/clickhouse/init.sql`): `timestamp`, `dataset`, `index1`,
  `blob1..20`, `double1..20`, `_sample_interval` (1: sem amostragem). `ORDER BY (index1,
timestamp)`.
- O `ae-sim` do `edge-local` grava nela (ADR 0007 do edge-local); rede `orakel-edge`; porta
  `127.0.0.1:8123` para o agregador na máquina (`AE_SQL_TRANSPORT=clickhouse`,
  `AE_SQL_URL=http://localhost:8123`).
- Resultado do spike (`infra/local/edge-local/src/clickhouse.test.ts`, também no CI com o
  ClickHouse como service do job): `SUM(_sample_interval)`, filtros por `index1`,
  `toTimeZone`, `toStartOfInterval`, `INTERVAL '1' DAY` e `COUNT(DISTINCT)` rodam iguais. O
  cliente do agregador adapta só o transporte e o formato da resposta
  (`output_format_json_quote_64bit_integers=0`). O `writeDataPoint` por service binding precisa
  de `ctx.waitUntil` (ADR 0004 do edge-local).

## Alternativas consideradas

- Tabela no Postgres (fallback do spike): desnecessária, o spike passou.
- Gravar NDJSON e ler com o agregador: não testaria a SQL.

## Consequências

- `pnpm local:load` (k6) gera pageviews com países variados e confere a contagem no ClickHouse.
