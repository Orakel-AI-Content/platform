---
paths:
  - 'src/**'
---

# Leitura do snapshot

- Nada de Astro fora de `src/v*/astro/`; URL, site, token e `fetch` chegam por parâmetro.
- Toda linha passa pelo `parseSnapshotLine`; o conjunto, pelo `validateSnapshot`.
- Código de problema novo? Classifique em `failures.ts` e teste nos dois lados (transitória e permanente).
- Caso novo de rede ou formato: reproduza com o `test-server.ts` (pedaços, status, corte).
  Detalhes: `docs/decisions/0003-falhas.md`
