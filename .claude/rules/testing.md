---
paths:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/vitest.config.ts'
---

# Testes

- Vitest com `@orakel/vitest-config` (`mergeConfig(baseConfig, …)`); teste ao lado do código em `src/**/*.test.ts`.
- `content-model`, `core` e `events` têm meta de 90% de linhas e branches (`withCoverageThreshold(90)`).
- Teste o comportamento pela API pública do pacote, não detalhes internos.
- Conteúdo de exemplo vem das fixtures NDJSON versionadas; mudou o schema, atualize-as no mesmo PR.
- Um arquivo: `pnpm vitest run <caminho>` na pasta da unidade.
  Detalhes: `docs/conventions/testing.md`
