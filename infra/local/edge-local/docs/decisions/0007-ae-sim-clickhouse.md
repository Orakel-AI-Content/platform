# 0007 – ae-sim grava no ClickHouse

- Status: aceito (completa o 0006)
- Data: 2026-09-30

## Contexto

O 0006 deixou o `ae-sim` gravando em NDJSON até o ambiente local ter o ClickHouse. O scaffold do
ambiente local (ADR 0014 da raiz) o trouxe, com a tabela `analytics.events` no layout do
Analytics Engine.

## Decisão

- O destino do `ae-sim` é um `Sink` (`src/ae-sink.ts`), escolhido na partida:
  `EDGE_LOCAL_CLICKHOUSE_URL` definida → `clickhouseSink` (INSERT `JSONEachRow` pela HTTP do
  ClickHouse, com `EDGE_LOCAL_CLICKHOUSE_USER`, `_PASSWORD` e `_DATABASE`); sem ela →
  `ndjsonSink` no volume, como antes (`pnpm dev` e testes).
- `toRow` converte o ponto posicional (`indexes`, `blobs`, `doubles`) nas colunas `index1`,
  `blob1..20` e `double1..20`, com `timestamp` do recebimento e `_sample_interval = 1`.
- O compose local passa a URL do serviço `clickhouse`; o `edge-local` espera o ClickHouse
  saudável.
- Spike AE × ClickHouse (`src/clickhouse.test.ts`): as consultas do agregador rodam iguais —
  `SUM(_sample_interval)`, filtros por `index1`, `toTimeZone`, `toStartOfInterval`,
  `INTERVAL '1' DAY` e `COUNT(DISTINCT)`. Roda só com `EDGE_LOCAL_TEST_CLICKHOUSE_URL` (no CI,
  com o ClickHouse como service do job), num banco descartável.

## Consequências

- Falha no INSERT responde 500 ao Worker do `ae-sim`; o ponto se perde, como no AE quando a
  gravação falha.
