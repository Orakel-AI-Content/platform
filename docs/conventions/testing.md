# Convenções de testes

Consulte ao escrever ou rodar testes. Cada unidade complementa em
`docs/conventions/testing.md` próprio só com o que for específico.

## Tipos

| Tipo                               | Ferramenta                 | Onde                                | Tarefa                                              |
| ---------------------------------- | -------------------------- | ----------------------------------- | --------------------------------------------------- |
| Unitário                           | Vitest                     | `src/**/*.test.ts`, junto do código | `test`                                              |
| Contrato da API de exportação      | Vitest + Postgres          | backoffice                          | `test:contract`                                     |
| Sites de exemplo (orçamento de JS) | build do blog com fixtures | blog                                | `build:examples`                                    |
| Acessibilidade                     | Playwright + axe           | blog                                | `test:a11y`                                         |
| Paridade estático × SSR            | Playwright                 | blog                                | `test:parity`                                       |
| E2E de telas (fluxos críticos)     | Playwright + Postgres      | backoffice                          | `playwright test --project=telas` (job `e2e-telas`) |
| E2E da pilha completa              | Playwright                 | backoffice                          | `test:e2e` (`e2e.yml`, fora do PR)                  |

## Configuração

Toda unidade com testes usa `@orakel/vitest-config`:

```ts
import { mergeConfig } from 'vitest/config';
import { baseConfig, withCoverageThreshold } from '@orakel/vitest-config';

export default mergeConfig(baseConfig, withCoverageThreshold(90)); // só nos pacotes com meta
```

## Cobertura (ADR 0007)

- 90% de linhas e branches em `content-model`, `core` e `events`.
- Nos demais, sem meta; a cobertura é só relatório.

## Fixtures

- Conteúdo de exemplo em **NDJSON versionado**, válido contra o `content-model`. As
  mesmas fixtures alimentam os sites de exemplo no CI e o teste de contrato.
- Ficam em `packages/content-model/fixtures/v<n>/`, expostas por
  `@orakel/content-model/fixtures/v<n>/*`; o teste do pacote valida cada uma.
- Mudou o schema? Atualize as fixtures no mesmo PR.

## Como rodar

- Tudo: `pnpm test`
- Uma unidade: `pnpm turbo run test --filter=@orakel/<nome>`
- Um arquivo (na pasta da unidade): `pnpm vitest run src/<arquivo>.test.ts`
- E2E de telas local, opcional, só a área tocada: `pnpm local:e2e:telas <área>` (sem build;
  só o Postgres do compose)
- E2E da área contra a pilha local: `pnpm local:up && pnpm local:seed && pnpm local:e2e:area <área>`
- E2E de telas: no CI, em todo PR que afeta o Backoffice (job `e2e-telas` do `ci.yml`)
- E2E da pilha completa: fora do PR (`e2e.yml`: push na main, noturno, label `e2e:completo` e
  manual; ADR 0017)

## E2E do Backoffice: só fluxos críticos (ADR 0019)

- O E2E cobre o que o produto não pode deixar de fazer e só o app inteiro prova: gravação pela
  tela, permissão por papel e publicação. Hoje são 10 testes de telas e 4 de pilha.
- Tela nova ou alterada não ganha E2E: ganha teste de componente (`test:browser`). Só um fluxo
  crítico novo entra no E2E.
- No teste de fluxo, nada de aparência: classe, tamanho, posição, título da aba, ordem de
  colunas e axe ficam nos testes de componente.

## Definição de pronto

Uma tarefa está pronta com `lint`, `typecheck`, `test`, `test:browser` e, se tocar o domínio,
`test:contract` (ADR 0017). O E2E de telas local é opcional; o da pilha completa não roda na
sessão.
