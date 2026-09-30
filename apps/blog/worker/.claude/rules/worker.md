---
paths:
  - 'src/**'
---

# Código do Worker

- Ordem fixa: bot → origem → `Content-Length` → `parseEventBody` → manifesto → sessão → ponto. Não leia o corpo antes de bot e origem.
- Descarte grava `discardDataPoint` com o motivo e responde só o status (204, 403, 413, 400, 422), sem corpo.
- `writeDataPoint` sem `await`; nenhuma chamada a servidor.
- Regra nova é módulo puro com teste em `rules.test.ts` ou no teste do fluxo.
- Respostas sempre com `cache-control: no-store`.
  Detalhes: `docs/architecture/code-design.md`, `docs/decisions/0002-fluxo-e-respostas.md`
