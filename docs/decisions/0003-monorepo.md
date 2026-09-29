# 0003 – Monorepo: workspace, pacotes internos e fronteiras

- Status: aceito
- Data: 2026-09-29

## Contexto

Um repositório para todos os sites, o Backoffice e os pacotes compartilhados, mantido
por uma pessoa. A entrada define pnpm workspaces + Turborepo e o layout de pastas, e
deixa em aberto o escopo dos pacotes, como são consumidos, como impor as fronteiras e
como alinhar versões.

## Decisão

- Escopo `@orakel/*`. Globs do workspace: `apps/*`, `apps/blog/worker`, `packages/*`,
  `adapters/*`, `tooling/*`. O Worker de borda é o pacote `@orakel/blog-worker`.
- Pacotes internos consumidos **como fonte TypeScript**: `exports` aponta para
  `src/*.ts`; quem consome compila (Vite/Astro, Next `transpilePackages`, wrangler,
  Vitest). Exceção: `@orakel/tokens` tem build (CSS + verificação de contraste).
- Fronteiras impostas por **ESLint `no-restricted-imports`** com presets por camada em
  `@orakel/eslint-config` (`domain`, `ui`, `adapter`, `app`), somados ao `exports` e ao
  isolamento do pnpm:
  - app nunca importa app; pacote nunca importa app;
  - `react` só em `packages/ui` e nos apps;
  - `astro` só em `adapters/astro` e no subcaminho `@orakel/content-client/astro`;
  - `next` só em `apps/backoffice`.
- **`catalog:` do pnpm em modo estrito**: uma versão por dependência.
- Tarefas padronizadas no `turbo.json`; cache local, preservado no CI com
  `actions/cache`; CI roda `turbo --affected`.
- Imagens construídas com `turbo prune --docker`; alvos e tags em
  `docker/docker-bake.hcl`, usado igual por `pnpm local:images` e pelo `images.yml`.

## Alternativas consideradas

- Pacotes compilados com `tsup` — fronteiras mais rígidas, mas um build e um watcher
  por pacote.
- `eslint-plugin-boundaries`, `dependency-cruiser`, Turbo Boundaries (experimental).
- Versões livres por unidade — risco de dois Zod ou dois React no grafo.
- Cache remoto da Vercel — exigiria token, e o CI é sem segredos.

## Consequências

- Cada unidade estende `@orakel/tsconfig`, `@orakel/eslint-config` (com o preset da
  camada) e, se testar, `@orakel/vitest-config`.
- Adicionar dependência: primeiro no `catalog` de `pnpm-workspace.yaml`, depois
  `"<dep>": "catalog:"` na unidade.
- `"agentGuidance": false` no `turbo.json`: o Turborepo 2.11 cria um `AGENTS.md` quando
  detecta um agente de IA. O repositório não usa `AGENTS.md`; a orientação útil (ler os
  docs da versão instalada em `node_modules/turbo/docs/`) está em
  `.claude/rules/tooling.md`.
