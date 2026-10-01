# Design de código do Backoffice

Consulte ao escrever código em `src/`. Convenções gerais (nomes, erros, logs): `docs/conventions/coding.md` da raiz.

## Camadas

| Camada           | Pode importar                                   | Não pode                   |
| ---------------- | ----------------------------------------------- | -------------------------- |
| `src/app`        | domínio, auth, db (só `getDb`), componentes     | ter regra de negócio       |
| `src/components` | tipos do domínio, `@/components`, `@/lib/utils` | acessar banco ou env       |
| `src/domain`     | db (executor, schema), `content-model`          | Next, React, `process.env` |
| `src/db`         | schema, env (só `getDb`)                        | domínio                    |
| `src/jobs`       | domínio, db, lib                                | Next                       |
| `src/bin`        | jobs, domínio, db, lib, env                     | Next                       |

## Padrões

- **Domínio:** funções `(executor, actor, …) → Promise<Result<T>>`. Primeiro
  `requireRole`, depois validação (`content-model`), depois gravação e
  `recordPendingChange` na mesma transação. Erro esperado é valor; bug lança.
- **Executor:** o domínio recebe `Executor` (banco ou transação) e não abre transação,
  salvo quando o fluxo é dele (ex.: `importSnapshot`).
- **Rotas:** leem request e env, chamam o domínio, traduzem `Result` em `problem+json`.
- **Imports:** caminho relativo com `.ts` em domínio, banco, auth, jobs e bin (o Node roda
  esses arquivos direto). O alias `@/` só na interface (`src/app`, `src/components`).
- **Env:** só `getEnv()` de `src/env.ts`, sob demanda (o `next build` não exige variáveis).

## Anti-padrões

- Regra de negócio em Server Action, no `proxy.ts` ou num componente.
- Gravar numa tabela exportada sem `recordPendingChange` (o teste de varredura quebra).
- Checar permissão só na interface.
- `process.env` fora de `src/env.ts` (exceto `NODE_ENV`/`NEXT_RUNTIME`/`SENTRY_DSN` no
  `instrumentation.ts`).
