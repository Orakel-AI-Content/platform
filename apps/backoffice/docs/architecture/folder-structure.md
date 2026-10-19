# Estrutura de pastas do Backoffice

Consulte para saber onde criar cada arquivo.

```
apps/backoffice/
├── drizzle/                     migrações SQL (drizzle-kit), só aditivas
├── src/
│   ├── app/                     App Router: telas e route handlers
│   │   ├── (admin)/             área autenticada (layout confere o Access)
│   │   └── api/                 export/v1 (rede interna), health
│   ├── components/              ver "Componentes" abaixo
│   ├── domain/<módulo>/         regras de negócio (access, pending-changes, sites, content, media, export, import, builds)
│   ├── db/                      client.ts, schema/, site-ids.ts
│   ├── auth/                    access-jwt.ts, internal-tokens.ts, request-actor.ts
│   ├── jobs/                    task-lists.ts, tasks/ (build, heartbeat, ingest-media, media-variants, media-reprocess)
│   ├── bin/                     worker, build-runner, migrate, seed, reprocess-media
│   ├── lib/                     logger, problem, heartbeat, s3, sentry, utils, docker, tar
│   ├── env.ts  proxy.ts  instrumentation.ts
└── test/
    ├── contract/                Vitest + Postgres
    └── e2e/                     Playwright + axe
```

Testes unitários ao lado do código (`src/**/*.test.ts`).

## Componentes

A organização e os nomes seguem o Ecme (`docs/migration/ecme.md`):

```
src/components/
├── ui/          primitivos do Ecme, um por pasta (Button/, Table/, …), com hooks/ e utils/
├── shared/      peças genéricas usadas por mais de uma área (EmptyState, StatusScreen,
│                ListControls, useListState, useLeaveGuard…)
├── template/    a moldura: cabeçalho, barra lateral, menu, SiteSwitcher, SideNavContext
├── layouts/     layouts de página (CollapsibleSide)
├── forms/       infraestrutura do SchemaForm: campos, rich text, schemaWalk (usada por
│                sites/, contents/ e editorial/)
└── <área>/      componentes de uma tela ou de uma área só (sites/, contents/, media/,
                 review/, editorial/)
```

Nomes de arquivo: PascalCase para componente e contexto (`EmptyState.tsx`,
`SideNavContext.tsx`), camelCase para hook (`useListState.ts`, com o nome do hook) e para
utilitário (`listQuery.ts`, `navigationTarget.ts`). O teste leva o nome do arquivo
(`EmptyState.test.tsx`). Um componente que passa a ser usado por outra área sobe para
`shared/`.

## Como acrescentar

**Um módulo de domínio:** `src/domain/<módulo>/` com funções `(executor, actor, …) →
Result`; ação nova em `PERMISSIONS` (`domain/access/rbac.ts`); se grava numa tabela que vai
para um site, inclua a tabela em `EXPORTED_TABLES` e chame `recordPendingChange`.

**Uma tabela:** `src/db/schema/<área>.ts` → `pnpm db:generate --name <nome>` → revise o SQL
(só aditivo) → `pnpm db:migrate`.

**Uma tela:** `src/app/(admin)/<rota>/page.tsx` (Server Component chamando o domínio);
interação em componente cliente em `src/components/<área>/` (`sites/SitesTable.tsx`,
`contents/ContentEditor.tsx`); campo de formulário em `forms/`; peça genérica em `shared/`;
peça portada do Ecme em `src/components/ui/`, `shared/`, `template/` ou `layouts/`
(`docs/migration/ecme.md`).

**Uma entidade editorial (como autores, taxonomias e menus):** a configuração do tipo
(schema, rótulos, títulos, lista) em `ENTITY_CONFIG` (`src/components/editorial/entityConfig.ts`,
sem `'use client'`: o servidor lê); leitura e Server Actions no mapa `ROUTES` de
`src/app/(admin)/sites/[site]/editorial-pages.tsx`. As rotas de lista, `novo/` e `[id]/` só
chamam a fábrica (`editorialListPage`, `editorialCreatePage`, `editorialEditPage`) e
exportam `default`, `generateMetadata` e o `export const dynamic`.

**Uma rota da API:** `src/app/api/<…>/route.ts`, fina; token interno com `hasBearer`;
erros com `problem()`. Rota interna nova: bloqueie o prefixo no `Caddyfile` e no Tunnel.

**Um job:** `src/jobs/tasks/<nome>.ts`, registrado em `workerTasks` (e no `WORKER_CRONTAB`
se for periódico); enfileiramento na transação da gravação, como `scheduleBuild`.
