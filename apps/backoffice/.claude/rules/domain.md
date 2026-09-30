---
paths:
  - 'src/domain/**'
---

# Domínio

- Função `(executor, actor, …) → Promise<Result<T>>`: `requireRole` primeiro, validação pelo `content-model` depois, gravação por último.
- Gravação em tabela de `EXPORTED_TABLES` chama `recordPendingChange(tx, site, origem, referência)` na mesma transação.
- IDs de entidades de site por `allocateId`; nunca reutilize um ID nem um número de bloco.
- Sem Next, React nem `process.env` aqui. Erro esperado é `Result`; só bug lança.
- Ação nova: `PERMISSIONS` em `access/rbac.ts` e o teste da matriz.
  Detalhes: `docs/architecture/code-design.md`, `docs/decisions/0003-dados-e-ids-por-site.md`
