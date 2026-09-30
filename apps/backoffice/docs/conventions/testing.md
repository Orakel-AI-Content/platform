# Testes do Backoffice

Complementa `docs/conventions/testing.md` da raiz só com o que é desta unidade.

| Tarefa          | Configuração                | Precisa                            |
| --------------- | --------------------------- | ---------------------------------- |
| `test`          | `vitest.config.ts`          | nada                               |
| `test:contract` | `vitest.contract.config.ts` | `DATABASE_URL` (Postgres limpo)    |
| `test:e2e`      | `playwright.config.ts`      | `pnpm local:up && pnpm local:seed` |

- **Unitários** ao lado do código; o domínio é testado sem banco quando a regra é pura
  (RBAC, mapeamentos) e pela suíte de contrato quando depende de transação.
- **Contrato** (`test/contract/`): cada arquivo migra e limpa o banco (`helpers.ts`);
  rodam um arquivo por vez. O snapshot de cada fixture do `content-model` tem de passar no
  `validateSnapshot` e reproduzir a fixture, menos as mudanças pendentes do header.
- **E2E** (`test/e2e/`): login pelo access-mock, tela de sites e axe (WCAG 2.2 AA). Use
  `E2E_BASE_URL` para outro endereço.

## Postgres para o contrato, na máquina

```sh
docker run -d --rm --name pg-contrato -e POSTGRES_USER=orakel -e POSTGRES_PASSWORD=orakel-ci \
  -e POSTGRES_DB=orakel -p 127.0.0.1:55432:5432 postgres:18.6-alpine
DATABASE_URL=postgres://orakel:orakel-ci@127.0.0.1:55432/orakel pnpm test:contract
```
