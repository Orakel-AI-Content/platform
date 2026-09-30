# 0006 – ae-sim mínimo em NDJSON

- Status: aceito
- Data: 2026-09-30

- Worker `ae-sim` (`src/ae-sim/worker.js`, `WorkerEntrypoint`) sobe junto do supervisor. `writeDataPoint(point)` repassa o ponto (layout posicional: `indexes`, `blobs`, `doubles`) por `fetch` ao supervisor (`POST /_ae-sim/points`) — um Worker não grava arquivo —, que o acrescenta com `receivedAt` a `<data>/events/<dia>.ndjson`.
- A config do `ae-sim` é gerada na partida (o destino depende da porta da administração).
- Depois: gravar no ClickHouse com o `init.sql` do layout, no scaffold da medição (agregador), onde o spike AE × ClickHouse decide as consultas.
