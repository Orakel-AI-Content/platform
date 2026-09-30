# syntax=docker/dockerfile:1
# edge-local (ADR 0005 da unidade): substituto local do deploy na Cloudflare. Só no ambiente
# local — o images.yml não publica esta imagem. Construa pela raiz: pnpm local:images
#
#   :8080  sites (<site>.localhost, pelo Caddy)   :8081  administração (rede publish)
#
# Base Debian (glibc): o workerd do wrangler não roda em musl.

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
ENV TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS prune
RUN npm install --global turbo@2.11.5
COPY . .
# O blog-worker entra só para os testes (Worker real no spike de fidelidade).
RUN turbo prune @orakel/edge-local @orakel/blog-worker --docker

FROM base AS build
COPY --from=prune /app/out/json/ .
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ .
RUN pnpm turbo run lint typecheck test --filter=@orakel/edge-local

FROM base AS runtime
ENV NODE_ENV=production WRANGLER_SEND_METRICS=false EDGE_LOCAL_DATA=/data
COPY --from=build --chown=node:node /app /app
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080 8081
CMD ["node", "infra/local/edge-local/src/server.ts"]
