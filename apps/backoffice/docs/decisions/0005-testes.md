# 0005 – Testes: unitários, contrato com Postgres e E2E

- Status: aceito (as camadas do E2E foram atualizadas pelo ADR 0017 da raiz)
- Data: 2026-09-29

## Decisão

| Tarefa          | O quê                                                                                                                                                      | Onde roda                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `test`          | Vitest sem banco: RBAC, varredura de `recordPendingChange`, JWT, tokens, mapeamento do snapshot, env                                                       | CI (`quality`)                                                     |
| `test:contract` | Vitest + Postgres (`DATABASE_URL`): snapshot × fixtures do `content-model`, transação das mudanças pendentes, `REPEATABLE READ`, IDs, agendamento de build | CI (job de contrato)                                               |
| `test:e2e`      | Playwright + axe contra o ambiente local (Caddy, access-mock, imagem); no `e2e.yml`, só os `@stack` e os `@perf`                                           | `e2e.yml`, fora do PR (ADR 0017 da raiz); local por área, opcional |

- As duas configurações do Vitest substituem o `include` da raiz (o `mergeConfig` somaria
  as listas e misturaria as suítes).
- Sem meta de cobertura (a raiz só a exige nos pacotes de contrato).
- E2E de telas (projeto `telas` do `playwright.config.ts`): Next, Postgres e access-mock, sem
  Docker; job `e2e-telas` em todo PR e, opcional, `pnpm local:e2e:telas <área>` na raiz (ADR
  0017 da raiz).

## Consequências

`turbo.json` passa `DATABASE_URL` para `test:contract`, `db:migrate` e `db:seed` (modo
estrito do Turbo), e o `ci.yml` define a variável no job de contrato.
