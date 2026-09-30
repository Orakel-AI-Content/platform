# syntax=docker/dockerfile:1
# Imagem só de teste do @orakel/core (ADR 0011 da unidade): lint, tipos e
# testes (com a meta de 90% de cobertura) num ambiente limpo. Não é publicada nem roda
# no CI. Construa pela raiz:
#
#   docker buildx bake core-test
#
# A construção falha se lint, typecheck ou testes falharem; não há imagem de execução.

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
ENV TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Poda o monorepo para o pacote e suas dependências de workspace.
FROM base AS prune
RUN npm install --global turbo@2.11.5
COPY . .
RUN turbo prune @orakel/core --docker

FROM base AS test
COPY --from=prune /repo/out/json/ .
# --ignore-scripts: sem .git no container, o "prepare" (lefthook install) não se aplica.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run lint typecheck test --filter=@orakel/core
