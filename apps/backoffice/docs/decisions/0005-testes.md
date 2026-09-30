# 0005 – Testes: unitários, contrato com Postgres e E2E

- Status: aceito
- Data: 2026-09-29

## Decisão

| Tarefa          | O quê                                                                                                                                                      | Onde roda            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `test`          | Vitest sem banco: RBAC, varredura de `recordPendingChange`, JWT, tokens, mapeamento do snapshot, env                                                       | CI (`quality`)       |
| `test:contract` | Vitest + Postgres (`DATABASE_URL`): snapshot × fixtures do `content-model`, transação das mudanças pendentes, `REPEATABLE READ`, IDs, agendamento de build | CI (job de contrato) |
| `test:e2e`      | Playwright + axe contra o ambiente local (Caddy, access-mock, imagem)                                                                                      | Local e `e2e.yml`    |

- As duas configurações do Vitest substituem o `include` da raiz (o `mergeConfig` somaria
  as listas e misturaria as suítes).
- Sem meta de cobertura (a raiz só a exige nos pacotes de contrato).

## Consequências

`turbo.json` passa `DATABASE_URL` para `test:contract`, `db:migrate` e `db:seed` (modo
estrito do Turbo), e o `ci.yml` define a variável no job de contrato.
