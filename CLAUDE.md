# platform

Rede de 5 a 20 sites de conteúdo gerados a partir de uma única base de código, com
Backoffice próprio, geração com LLM e revisão humana. Monorepo pnpm 11 + Turborepo,
TypeScript 6 estrito, Node 24. Três planos: conteúdo (Backoffice Next.js + Postgres),
entrega (sites Astro estáticos na Cloudflare) e eventos (Worker de borda). Domínio em
pacotes agnósticos de framework, adaptador fino por framework; o que varia entre
sites é configuração.

## Comandos (na raiz)

- Instalar: `pnpm install`
- Pipeline: `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test`
- Uma unidade: `pnpm turbo run <tarefa> --filter=@orakel/<nome>`
- Um teste (na pasta da unidade): `pnpm vitest run <caminho>`
- Formatar: `pnpm format`
- Ambiente local: `pnpm local:up` · `local:seed` · `local:check` · `local:publish <site>` · `local:load` · `local:trust` · `local:down` · `local:e2e`
- Compose direto: `infra/local/compose.sh <args>`

## Unidades

Geradas:

- `packages/content-model` – schemas Zod de conteúdo e configuração de site
- `packages/content-client` – cliente da API de exportação: snapshot em streaming e loaders do Astro
- `packages/core` – rotas, head e JSON-LD, sitemap, RSS, robots.txt, `_redirects` e `_headers`
- `packages/tokens` – temas DTCG → variáveis CSS e fontes, contraste AA verificado no build
- `packages/elements` – Web Components do degrau 2: carrossel, menu, copiar link, compartilhar
- `packages/events` – formato versionado dos eventos, manifesto e script do navegador
- `apps/blog` – sites Astro por `SITE_ID` (estático) e visualização SSR (`/<site>/<caminho>`); exclui `worker/` do tsconfig e do ESLint
- `apps/blog/worker` – Worker de borda `/_e/*`: valida pageviews e grava no Analytics Engine
- `apps/backoffice` – Next.js: UI (layout e componentes do Ecme), API de exportação; processos worker (jobs e agregador) e build-runner (task `build`: render e publish pelo `docker-socket-proxy`)
- `packages/build-contract` – contrato do volume `/build` (`result.json`, `publish.json`), só Zod
- `tooling/build-site` – entrypoints `render`, `publish` e `ssr` da imagem `site-builder`
- `infra/local/edge-local` – substituto local do deploy: um Worker por site, versões, rollback e `ae-sim`

Previstas (gere com `/scaffold` no caminho da unidade):

- `packages/ui` – ilhas React (último recurso)
- `adapters/astro` – integração Astro
- `apps/generator` – geração com LLM (fase 2)
- `apps/backoffice` (retomada) – módulos da L4: Conteúdo, Mídia, Revisão, Publicação e ações do Registro de instâncias (retomar, rollback) (próximo da fila)

## Regras invioláveis

- Rode `pnpm lint`, `pnpm typecheck` e `pnpm test` antes de concluir qualquer tarefa.
- Respeite as fronteiras de `.claude/rules/architecture.md`.
- Versão de dependência só no `catalog` de `pnpm-workspace.yaml`; na unidade, `catalog:`.
- Use `.env.example` como referência; nunca leia nem escreva `.env` ou `.env.local`.
- Não edite `.agents/`, `.claude/skills/` nem `skills-lock.json` (skills do orakel).
- Nova decisão de arquitetura → ADR em `docs/decisions/`; mudou a estrutura → atualize `docs/architecture/overview.md`.
- Unidade nova → linha em "Unidades" acima e em `units:` de `docs/project-spec.yaml`.
- Tela do Backoffice nova ou alterada: o template Ecme (`Orakel-AI-Content/design-reference`)
  é a referência de design e de código de frontend; porte seguindo
  `apps/backoffice/docs/migration/ecme.md` (ADR 0016 da unidade).

## Workflow orakel

Repositório de planejamento: `Orakel-AI-Content/workspace`
GitHub Project: `Workspace` — `https://github.com/orgs/Orakel-AI-Content/projects/2`

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – planos, contratos, mapa das unidades, como criar uma
- `docs/conventions/coding.md` – fronteiras, erros, logs, configuração, dependências
- `docs/conventions/testing.md` – tipos de teste, cobertura, fixtures
- `docs/conventions/git.md` – branches, commits, releases do core
- `docs/design/accessibility.md` – meta WCAG 2.2 AA
- `docs/domain/glossary.md` – termos do domínio
- `docs/guides/local-setup.md` – ambiente local
- `docs/guides/claude-code.md` – como o repositório usa o Claude Code
- `docs/decisions/` – por que as escolhas foram feitas
- `docs/project-spec.yaml` – todas as decisões e as unidades previstas
