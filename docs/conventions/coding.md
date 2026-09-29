# Convenções de código

Consulte ao escrever código em qualquer unidade. O que o ESLint e o Prettier já
cobrem não está aqui.

## Fronteiras (ADR 0003)

- App nunca importa app; pacote nunca importa app. Compartilhou? Vira pacote.
- Importe pacotes pelo nome (`@orakel/<nome>` ou subcaminho do `exports`), nunca por
  `src/` ou caminho relativo que sai da unidade.
- Camadas do preset `layer()` de `@orakel/eslint-config`:
  - `domain` — sem React, Astro ou Next. Lógica pura, agnóstica de framework.
  - `ui` — React permitido; sem Astro nem Next.
  - `adapter` — Astro permitido; sem Next.
  - `app` — tudo, exceto outros apps.
- Exceção: `@orakel/content-client/astro` (loader do Content Layer) pode importar Astro.
- Nada de fork por site: diferenças entre sites viram campo de configuração no
  `content-model`, nunca `if (siteId === …)`.

## Nomes

- Pacotes `@orakel/<kebab-case>`; arquivos em `kebab-case.ts`.
- Tipos e schemas Zod em `PascalCase` (`ArticleSchema`, `type Article`).
- Funções e variáveis em `camelCase`; constantes de módulo em `UPPER_SNAKE_CASE`.
- Campos de configuração e conteúdo seguem os nomes do schema (ex.: `indexavel`, `n`).

## TypeScript

- Modo estrito, com `noUncheckedIndexedAccess` e `erasableSyntaxOnly` (sem `enum` nem
  `namespace`; use uniões de literais e `as const`).
- `import type` para tipos (`verbatimModuleSyntax`).
- Sem `any`; na borda, `unknown` + Zod.

## Erros (ADR 0008)

- **Domínio:** erro esperado é valor, numa união discriminada no estilo `safeParse`:
  `{ ok: true, value } | { ok: false, issues }`. Validação semântica devolve a lista de
  problemas, não lança.
- **Inesperado** (bug, invariante quebrada, falha de infraestrutura): lança `Error` com
  mensagem clara e `cause`.
- **Bordas traduzem:** APIs HTTP respondem `application/problem+json` (RFC 9457); CLIs
  saem com código diferente de zero e mensagem no stderr; Workers respondem status
  adequado sem vazar detalhes.

## Logs e observabilidade

- Processos Node: **pino**, JSON, um objeto por linha, com `msg` e contexto (`siteId`,
  `jobId`…). Nunca logue segredos nem dados de visitantes.
- Workers: `console.log(JSON.stringify({...}))`.
- Erros inesperados vão para o Sentry quando `SENTRY_DSN` está definido.
- Jobs periódicos pingam `HEARTBEAT_BASE_URL` ao terminar.

## Configuração

- Toda variável que muda entre local e produção está em `.env.example` na raiz.
- Cada unidade valida as que usa em `src/env.ts` com Zod e falha no boot com a lista
  do que falta. Nunca leia `process.env` fora desse módulo.

## Dependências

- Versão só no `catalog` de `pnpm-workspace.yaml`; na unidade, `"<dep>": "catalog:"`.
- Pacote interno: `"@orakel/<nome>": "workspace:*"`.
- O pnpm espera 24 h por versões novas (`minimumReleaseAge`); o Renovate abre os PRs.
