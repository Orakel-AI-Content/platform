# syntax=docker/dockerfile:1
# Imagem infra-runner (ADR 0027 da raiz): plano e apply da raiz OpenTofu de UM site, iniciada
# pelo build-runner do backoffice com um volume próprio da execução em /infra.
#
#   docker run … infra-runner:<sha> plan    plano salvo e cifrado + /infra/infra-plan.json
#   docker run … infra-runner:<sha> apply   aplica /infra/site.tfplan + /infra/infra-apply.json
#
# OpenTofu e provider fixados (os mesmos do CI e de infra/site/.terraform.lock.hcl). O provider é
# espelhado na imagem: em execução, a rede só serve à API da Cloudflare e ao R2 (backend), nunca
# ao registry. Construa pela raiz: docker buildx bake infra-runner (ou pnpm local:images).

FROM ghcr.io/opentofu/opentofu:1.13.9-minimal@sha256:84af0049634b7a7c455ab79c485818a8ef7f775cad3b2d42ce1c98ade720b5d1 AS tofu

FROM alpine:3.23@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2 AS base
# jq: resumo do plano, saídas e resultados; curl: Crawler Hints (rota de flags da zona).
RUN apk add --no-cache jq curl ca-certificates
COPY --from=tofu /usr/local/bin/tofu /usr/local/bin/tofu
ENV TF_IN_AUTOMATION=1 CHECKPOINT_DISABLE=1 TF_INPUT=0
COPY infra/site /opt/infra/site
COPY infra/modules/site /opt/infra/modules/site

# Espelho do provider (com rede, só no build), na plataforma da imagem e conferido pelo lockfile.
# O init instala o módulo local, que o mirror precisa para ler os providers.
FROM base AS mirror
ARG TARGETOS TARGETARCH
RUN cd /opt/infra/site \
 && export TF_DATA_DIR=/tmp/tofu-mirror \
 && tofu init -backend=false -lockfile=readonly \
 && tofu providers mirror -platform="${TARGETOS}_${TARGETARCH}" /opt/infra/providers

FROM base AS runtime
COPY --from=mirror /opt/infra/providers /opt/infra/providers
COPY docker/infra-runner/tofurc /opt/infra/tofurc
COPY docker/infra-runner/entrypoint.sh docker/infra-runner/summary.jq /opt/infra/bin/
ENV TF_CLI_CONFIG_FILE=/opt/infra/tofurc
# Prova, sem rede, que o init resolve o provider só pelo espelho e que a raiz é válida.
RUN --network=none cd /opt/infra/site \
 && TF_DATA_DIR=/tmp/tofu-check tofu init -backend=false -lockfile=readonly \
 && TF_DATA_DIR=/tmp/tofu-check tofu validate \
 && rm -rf /tmp/tofu-check
# Usuário sem privilégios; o volume /infra é dele. A pasta de trabalho do tofu (.terraform) fica
# fora da raiz embutida, que continua só leitura.
RUN adduser -D -u 1000 infra && mkdir /infra && chown infra:infra /infra
USER infra
ENV TF_DATA_DIR=/tmp/tofu
WORKDIR /opt/infra/site
ENTRYPOINT ["/opt/infra/bin/entrypoint.sh"]
