# 0006 – Uma imagem, três processos, layout do workspace

- Status: aceito
- Data: 2026-09-29

## Decisão

- `Dockerfile` com `turbo prune`: dependências de produção instaladas no layout do
  workspace, código-fonte e o build standalone do Next. Alvo `backoffice` no grupo
  `images` do bake (tags `SHA` e, fora do CI, `local`).
- Comandos: `web` (`node .next/standalone/apps/backoffice/server.js`, padrão), `worker`
  (`node src/bin/worker.ts`), `build-runner`, `migrate` e `seed` (`node src/bin/<nome>.ts`).
- Os processos Node rodam direto do `.ts` (o Node 24 remove os tipos). Ele se recusa a
  fazer isso dentro de `node_modules`, então a imagem **não** usa `pnpm deploy` (que copia
  os pacotes internos para lá): os pacotes do workspace ficam como links para `/repo/packages`.
- No compose: `backoffice-migrate` (sai depois de migrar), `backoffice-web` (com
  healthcheck em `/api/health`) e `backoffice-worker`. `build-runner`, `docker-socket-proxy`
  e a rede `export` entram com o `build-site`.

## Alternativas consideradas

- `pnpm deploy`: imagem menor, mas os processos Node falham ao importar o `content-model`.
- Bundle dos processos com esbuild: imagem menor, com mais uma etapa de build (pendência).

## Consequências

A imagem tem ~1,1 GB; otimizar fica em `open_questions`.
