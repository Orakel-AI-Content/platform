---
paths:
  - 'src/**'
---

# Rotas e arquivos da borda

- Mudou uma rota? Ajuste `routes.ts`, `RESERVED_SLUGS` e rode os snapshots do sitemap; nada de caminho montado fora dali.
- Arquivo gerado: ordem estável, sem hora atual, escape de XML/HTML; teste com snapshot e revise o diff.
- `_headers`: nunca regra de cache em `/*` (as regras somam valores); `immutable` só em caminho com hash.
- `robots.txt` nunca bloqueia o rastreio por `indexavel` desligado.
  Detalhes: `docs/decisions/0003-rotas-e-colisoes.md`, `docs/decisions/0006-headers.md`
