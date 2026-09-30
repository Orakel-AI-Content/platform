---
paths:
  - 'src/**'
---

# Supervisor do edge-local

- `Store` não conhece o runtime; teste regras com o runtime falso e comportamento de Worker no `fidelity.test.ts`.
- Erros esperados: `StoreError` com status (400, 404, 409).
- Ordem da troca: sobe → aponta → `active` → desliga a antiga.
- Teste o proxy com `http.request` (o `fetch` do Node descarta o `Host`).
  Detalhes: `docs/architecture/code-design.md`
