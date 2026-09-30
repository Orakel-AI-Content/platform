---
paths:
  - 'src/db/**'
  - 'drizzle/**'
  - 'drizzle.config.ts'
---

# Banco e migrações

- Schema em `src/db/schema/*.ts`; mudou? `pnpm db:generate --name <nome>` e revise o SQL gerado.
- Só migrações aditivas (expand/contract): remover coluna ou tabela é um segundo deploy, depois que nada mais a usa. Nunca edite uma migração já aplicada.
- Entidades de site com chave `(site_id, id)`; tabela nova que vai para um site entra em `EXPORTED_TABLES`.
- Um pool por processo (`getDb`), compartilhado com o Graphile Worker.
  Detalhes: `docs/decisions/0003-dados-e-ids-por-site.md`
