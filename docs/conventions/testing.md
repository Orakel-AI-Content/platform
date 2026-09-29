# Convenções de testes

Consulte ao escrever ou rodar testes. Cada unidade complementa em
`docs/conventions/testing.md` próprio só com o que for específico.

## Tipos

| Tipo                               | Ferramenta                 | Onde                                | Tarefa                             |
| ---------------------------------- | -------------------------- | ----------------------------------- | ---------------------------------- |
| Unitário                           | Vitest                     | `src/**/*.test.ts`, junto do código | `test`                             |
| Contrato da API de exportação      | Vitest + Postgres          | backoffice                          | `test:contract`                    |
| Sites de exemplo (orçamento de JS) | build do blog com fixtures | blog                                | `build:examples`                   |
| Acessibilidade                     | Playwright + axe           | blog                                | `test:a11y`                        |
| Paridade estático × SSR            | Playwright                 | blog                                | `test:parity`                      |
| E2E completo                       | Playwright                 | apps                                | `test:e2e` (só local ou `e2e.yml`) |

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
- Mudou o schema? Atualize as fixtures no mesmo PR.

## Como rodar

- Tudo: `pnpm test`
- Uma unidade: `pnpm turbo run test --filter=@orakel/<nome>`
- Um arquivo (na pasta da unidade): `pnpm vitest run src/<arquivo>.test.ts`
- E2E local: `pnpm local:up && pnpm local:seed && pnpm local:e2e`
