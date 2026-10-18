# backoffice

Ferramenta administrativa (não é CMS): conteúdo e configuração dos sites, revisão,
publicação, registro de sites e releases, e a API de exportação que o build consome.
Stack: Next.js 16 (App Router) + Drizzle/Postgres + Graphile Worker; contratos em
`@orakel/content-model/v1`. Parte do monorepo — regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Rodar: `pnpm dev` · processos: `pnpm worker`
- Testar: `pnpm test` (um arquivo: `pnpm vitest run <caminho>`)
- Contrato (Postgres): `DATABASE_URL=… pnpm test:contract` · E2E: `pnpm test:e2e`
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Banco: `pnpm db:generate --name <nome>` · `pnpm db:migrate` · `pnpm db:seed`
- Mídia: `pnpm media:reprocess [site]` (variantes que faltam no perfil de imagem)

## Regras invioláveis

- Regra de negócio só em `src/domain/<módulo>`; rotas, telas, Server Actions, jobs e o
  `proxy.ts` só delegam. Permissão com `requireRole` no domínio, nunca só na interface.
- Gravou numa tabela que vai para um site? `recordPendingChange` na mesma transação (ele
  também agenda o build). Coluna só operacional do site: `domain/builds/site-state.ts`.
- Docker só pela interface `ContainerRuntime`; rota nova da API do Docker → lista do
  `docker-socket-proxy` no compose (ADR 0011 da raiz).
- Migração só aditiva (expand/contract); gere com `db:generate` e revise o SQL.
- Domínio, banco, auth, jobs e bin importam por caminho relativo com `.ts` (o Node os roda
  direto); o alias `@/` só na interface.
- `process.env` só via `src/env.ts`.
- `/api/export` e `/api/internal` só na rede interna; rota interna nova também é bloqueada
  no `infra/local/Caddyfile`.
- Interface: o Ecme (`Orakel-AI-Content/design-reference`) é a referência de design e de
  código. Antes de criar ou mudar uma tela, ache a peça equivalente no template e porte-a
  pelas regras de `docs/migration/ecme.md` (ADR 0016).

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – papel, processos, fluxo gerado
- `docs/architecture/code-design.md` – camadas e padrões do domínio
- `docs/architecture/folder-structure.md` – como acrescentar módulo, tabela, tela, rota ou job
- `docs/conventions/testing.md` – unitários, contrato com Postgres, E2E
- `docs/migration/ecme.md` – registro do porte do Ecme: onde está o template, regras de porte, testes, histórias
- `docs/design/design-system.md` – padrão de toda tela no Ecme: componentes, cores e contraste, tema, moldura, acessibilidade
- `docs/decisions/` – por que as escolhas foram feitas (0002: escopo e backlog; 0008: task build; 0010: janela por site; 0011: sites.auto.tfvars.json; 0012: envio e ingestão de imagens; 0013: variantes e registro da mídia; 0014: reprocessamento; 0015: status mutável da versão; 0016: Ecme como design system)
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
