# syntax=docker/dockerfile:1
# Imagem site-builder (ADR 0006 do build-site): a release do core. Leva o apps/blog, os
# pacotes, o Pagefind e o wrangler, e três entrypoints:
#
#   docker run … site-builder:<release> render    astro build do site → /build (rede export)
#   docker run … site-builder:<release> publish   deploy do /build (rede publish)
#   docker run … site-builder:<release> ssr       visualização de todos os sites (blog-preview)
#
# Base Debian (glibc): o workerd do wrangler não roda em musl. Construa pela raiz:
#   docker buildx bake site-builder     (ou pnpm local:images)

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
ENV TURBO_TELEMETRY_DISABLED=1 ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Poda o monorepo para o build-site, o blog e o Worker (com os pacotes deles). O blog não é
# dependência declarada do build-site: senão o ^build do Turbo rodaria o astro build do blog
# antes de todo typecheck e teste.
FROM base AS prune
RUN npm install --global turbo@2.11.5
COPY . .
RUN turbo prune @orakel/build-site @orakel/blog @orakel/blog-worker --docker

FROM base AS build
COPY --from=prune /app/out/json/ .
# --ignore-scripts: sem .git, o "prepare" (lefthook) não se aplica; os binários nativos
# (esbuild, workerd, pagefind) vêm dos pacotes opcionais da plataforma.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ .
# Testes do build-site, tokens compilados (dist/) e o servidor da visualização.
RUN pnpm turbo run lint typecheck test --filter=@orakel/build-site \
 && pnpm turbo run build --filter=@orakel/tokens \
 && cd apps/blog && BLOG_OUTPUT=preview node node_modules/astro/bin/astro.mjs build

FROM base AS runtime
ARG RELEASE=local
ENV NODE_ENV=production RELEASE=${RELEASE}
# O render escreve no apps/blog (.astro) e no volume /build: os dois são do usuário node.
COPY --from=build --chown=node:node /app /app
RUN mkdir /build && chown node:node /build
USER node
ENTRYPOINT ["node", "tooling/build-site/src/cli.ts"]
