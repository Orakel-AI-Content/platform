# Visão geral do edge-local

Consulte antes de mexer na publicação local, nas versões ou no runtime dos Workers.

```mermaid
flowchart LR
  P[site-builder publish] -->|PUT tar.gz :8081| A[administração]
  A --> S[Store: versões imutáveis, active]
  A --> V[Supervisor]
  V -->|unstable_startWorker| W1[Worker exemplo-a vN]
  V --> AE[Worker ae-sim]
  C[Caddy *.localhost] -->|Host| X[proxy :8080] --> W1
  W1 -->|EVENTS, service binding| AE -->|POST /_ae-sim/points| A --> N[(ClickHouse ou NDJSON)]
```

- Runtime e proxy: ADR 0002. Versões e API: ADR 0003. Fidelidade: ADR 0004. Imagem e compose: ADR 0005. `ae-sim`: ADRs 0006 e 0007.
- Só local. Em produção, o mesmo `tar.gz` segue para `wrangler deploy` (alvo `cloudflare` do build-site).
