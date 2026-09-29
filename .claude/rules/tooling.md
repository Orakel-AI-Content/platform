---
paths:
  - 'tooling/**'
  - 'turbo.json'
  - 'pnpm-workspace.yaml'
---

# Configurações compartilhadas

- Estes pacotes são consumidos por todas as unidades: mudança aqui afeta o repositório inteiro. Rode `pnpm lint && pnpm typecheck && pnpm test` na raiz antes de concluir.
- Presets de ESLint por camada ficam em `tooling/eslint-config/index.js` (`layer()`); regras de fronteira novas entram em `forbidden` ou `always`, com mensagem em português.
- `tooling/tsconfig`: `base.json` é estrito; não afrouxe opções — unidades específicas estendem e ajustam.
- Versões só no `catalog` de `pnpm-workspace.yaml`.
- Antes de mudar `turbo.json`, leia os docs da versão instalada em `node_modules/turbo/docs/` (o Turborepo muda entre versões).
- `tooling/build-site` é uma unidade (código de produção), não configuração.
  Detalhes: `docs/conventions/coding.md`, `docs/decisions/0003-monorepo.md`
