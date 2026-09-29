# 0007 – Qualidade: testes, lint, hooks e git

- Status: aceito
- Data: 2026-09-29

## Decisão

- **Testes:** Vitest nos pacotes e módulos de domínio, com a configuração comum de
  `@orakel/vitest-config`; Playwright para E2E e axe.
- **Cobertura:** 90% de linhas e branches em `content-model`, `core` e `events`
  (contratos e funções puras). Sem meta nos demais pacotes.
- **Lint e format:** ESLint 10 (flat config) + typescript-eslint + Prettier 3, com
  configurações em `tooling/`. O hook do Claude formata cada arquivo editado.
- **Tipos:** `tsc --noEmit` por pacote.
- **Git hooks:** lefthook no `pre-commit` (Prettier e ESLint `--fix` nos arquivos staged).
- **Git:** `main` sem proteção; branch `<issue>-<slug>`; Conventional Commits; squash
  merge (o título do PR vira o commit); tags manuais `core-vX.Y.Z`.

## Alternativas consideradas

- Meta global de 80% — incentiva testes de enfeite em código de UI e cola.
- husky + lint-staged — duas dependências para o mesmo resultado.
- Sem hooks — só o CI pegaria o problema, gastando minutos do plano Free.

## Consequências

- Os pacotes com meta de cobertura configuram `thresholds` no próprio
  `vitest.config.ts`.
