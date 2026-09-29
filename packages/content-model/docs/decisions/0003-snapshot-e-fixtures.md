# 0003 – Linhas do snapshot e fixtures ficam no content-model

- Status: aceito
- Data: 2026-09-29

## Contexto

O snapshot da API de exportação é NDJSON: `header`, uma linha por entidade e `end`. O
backoffice produz, o `content-client` consome, e o teste de contrato confere um contra
o outro. As fixtures NDJSON alimentam os dois sites de exemplo no CI e o teste de
contrato. A entrada do blog as colocava em `apps/blog/fixtures/`, mas um app não lê de
outro app (ADR 0003 da raiz).

## Decisão

- `SnapshotLineSchema`, em cada versão, é uma união discriminada por `type`: `header`
  (`schemaVersion`, `site`, `pendingChangeIds`), `{ type, data }` para cada entidade e
  `end` (`counts`). A versão da API de exportação é a `schemaVersion`.
- `validateSnapshot` monta o snapshot e confere a estrutura (header primeiro, end por
  último, uma config, contagens iguais às do end para detectar corte) antes das demais
  regras semânticas.
- As fixtures ficam em `fixtures/v<n>/<site>.ndjson`, expostas por
  `@orakel/content-model/fixtures/v<n>/*`. `src/fixtures.test.ts` valida cada linha de
  cada fixture no schema e na validação semântica.
- **Diverge da entrada do blog** (`apps/blog/fixtures/`).

## Alternativas consideradas

- Envelope no `content-client`: o backoffice dependeria de um pacote cliente para
  validar a própria saída, e o envelope poderia ter versão diferente da das entidades.
- Fixtures em `apps/blog/fixtures/`: backoffice e `content-client` não poderiam usá-las.
- Pacote `packages/fixtures`: mais uma unidade, longe do schema que as valida.

## Consequências

- Mudou o schema e a fixture não acompanhou? O teste do pacote quebra no mesmo PR.
- O scaffold do blog passa a ler as fixtures deste pacote (pendência registrada no
  spec da raiz).
