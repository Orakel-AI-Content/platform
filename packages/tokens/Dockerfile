# syntax=docker/dockerfile:1
# Imagem só de teste do @orakel/tokens (ADR 0007 da unidade): build (com o contraste),
# lint, tipos e testes num ambiente limpo, sem fontes do sistema nem dist/ antigo.
# Não é publicada nem roda no CI. Construa pela raiz:
#
#   docker buildx bake tokens-test
#
# A construção falha se build, lint, typecheck ou testes falharem; não há imagem de execução.

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
ENV TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Poda o monorepo para o pacote e suas dependências de workspace.
FROM base AS prune
RUN npm install --global turbo@2.11.5
COPY . .
RUN turbo prune @orakel/tokens --docker

FROM base AS test
COPY --from=prune /repo/out/json/ .
# --ignore-scripts: sem .git no container, o "prepare" (lefthook install) não se aplica.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build lint typecheck test --filter=@orakel/tokens
