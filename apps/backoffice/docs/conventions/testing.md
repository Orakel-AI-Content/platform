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
- **E2E** (`test/e2e/`): login pelo access-mock, telas de sites e o editor de conteúdo, e axe
  (WCAG 2.2 AA). Rodam contra a imagem `backoffice:local`: depois de mudar o código,
  `docker/bake.sh backoffice` e `infra/local/compose.sh up -d --wait backoffice-web`. Use
  `E2E_BASE_URL` para outro endereço.
- **Sites do E2E**: quem cadastra site (`e2e-<timestamp>`) registra o ID e o remove do banco
  no `afterAll` com `removeSites` (`test/e2e/cleanup.ts`), junto com o build agendado.

## Postgres para o contrato, na máquina

```sh
docker run -d --rm --name pg-contrato -e POSTGRES_USER=orakel -e POSTGRES_PASSWORD=orakel-ci \
  -e POSTGRES_DB=orakel -p 127.0.0.1:55432:5432 postgres:18.6-alpine
DATABASE_URL=postgres://orakel:orakel-ci@127.0.0.1:55432/orakel pnpm test:contract
```
