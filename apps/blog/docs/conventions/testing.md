# Testes do blog

| Comando               | O quê                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm test`           | Vitest: rotas, links, sumário, datas, fontes de dados, orçamento, env, Consent Mode, idempotência |
| `pnpm build:examples` | Sites de exemplo (2 builds cada, comparados) + SSR em `dist-examples/`                            |
| `pnpm test:a11y`      | axe em 375 e 1280 px (precisa do `build:examples`)                                                |
| `pnpm test:parity`    | Estático × SSR, HTML normalizado (precisa do `build:examples`)                                    |

- Primeira vez: `pnpm exec playwright install chromium`.
- Os testes unitários leem as fixtures pelo mesmo caminho do modo fixture (`src/test-support.ts`).
- Página nova entra na lista do `e2e/a11y.spec.ts`. Diferença de paridade que for intencional vai para `e2e/normalize.ts`, com o motivo.
