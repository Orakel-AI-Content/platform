# Estrutura de pastas do Backoffice

Consulte para saber onde criar cada arquivo.

```
apps/backoffice/
├── drizzle/                     migrações SQL (drizzle-kit), só aditivas
├── src/
│   ├── app/                     App Router: telas e route handlers
│   │   ├── (admin)/             área autenticada (layout confere o Access)
│   │   └── api/                 export/v1 (rede interna), health
│   ├── components/              ui/ (shadcn/ui) e componentes de tela
│   ├── domain/<módulo>/         regras de negócio (access, pending-changes, sites, content, media, export, import, builds)
│   ├── db/                      client.ts, schema/, site-ids.ts
│   ├── auth/                    access-jwt.ts, internal-tokens.ts, request-actor.ts
│   ├── jobs/                    task-lists.ts, tasks/ (build, heartbeat, ingest-media)
│   ├── bin/                     worker, build-runner, migrate, seed
│   ├── lib/                     logger, problem, heartbeat, s3, sentry, utils, docker, tar
│   ├── env.ts  proxy.ts  instrumentation.ts
└── test/
    ├── contract/                Vitest + Postgres
    └── e2e/                     Playwright + axe
```

Testes unitários ao lado do código (`src/**/*.test.ts`).

## Como acrescentar

**Um módulo de domínio:** `src/domain/<módulo>/` com funções `(executor, actor, …) →
Result`; ação nova em `PERMISSIONS` (`domain/access/rbac.ts`); se grava numa tabela que vai
para um site, inclua a tabela em `EXPORTED_TABLES` e chame `recordPendingChange`.

**Uma tabela:** `src/db/schema/<área>.ts` → `pnpm db:generate --name <nome>` → revise o SQL
(só aditivo) → `pnpm db:migrate`.

**Uma tela:** `src/app/(admin)/<rota>/page.tsx` (Server Component chamando o domínio);
interação em componente cliente em `src/components/`; componente do shadcn em
`src/components/ui/`.

**Uma rota da API:** `src/app/api/<…>/route.ts`, fina; token interno com `hasBearer`;
erros com `problem()`. Rota interna nova: bloqueie o prefixo no `Caddyfile` e no Tunnel.

**Um job:** `src/jobs/tasks/<nome>.ts`, registrado em `workerTasks` (e no `WORKER_CRONTAB`
se for periódico); enfileiramento na transação da gravação, como `scheduleBuild`.
