# syntax=docker/dockerfile:1
# Imagem do backoffice (ADR 0006 da unidade): uma imagem, três comandos, a partir de
# /repo/apps/backoffice:
#   web      node .next/standalone/apps/backoffice/server.js   (padrão)
#   worker   node src/bin/worker.ts
#   build-runner, migrate, seed: node src/bin/<nome>.ts
# Os processos Node rodam direto do .ts. O Node não remove tipos dentro de node_modules,
# então a imagem mantém o layout do workspace: os pacotes internos (ex.: content-model)
# são links para /repo/packages, não cópias em node_modules.
# Construa pela raiz: pnpm local:images (ou docker buildx bake backoffice).

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
ENV TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Poda o monorepo para o backoffice e suas dependências de workspace.
FROM base AS prune
RUN npm install --global turbo@2.11.5
COPY . .
RUN turbo prune @orakel/backoffice --docker

# Dependências de produção, no layout do workspace.
# --ignore-scripts: sem .git no container, o "prepare" (lefthook) não se aplica.
FROM base AS deps
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Build do Next (standalone), com todas as dependências.
FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
RUN pnpm --filter @orakel/backoffice build

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /repo
COPY --from=deps --chown=node:node /repo/ ./
COPY --from=prune --chown=node:node /repo/out/full/ ./
COPY --from=build --chown=node:node /repo/apps/backoffice/.next/standalone ./apps/backoffice/.next/standalone
COPY --from=build --chown=node:node /repo/apps/backoffice/.next/static ./apps/backoffice/.next/standalone/apps/backoffice/.next/static
WORKDIR /repo/apps/backoffice
USER node
EXPOSE 3000
CMD ["node", ".next/standalone/apps/backoffice/server.js"]
