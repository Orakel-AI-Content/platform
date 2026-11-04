# Máquina limpa para ensaiar docs/guides/local-setup.md do zero (#563): Linux só com os
# pré-requisitos do guia (Node e Corepack, Docker com Compose e Buildx) e um dockerd próprio
# (Docker-in-Docker), sem imagens, volumes, node_modules nem CA do Caddy. Ferramentas que o
# guia não pede ficam de fora de propósito: se o roteiro precisar delas, o defeito é do guia.
# Uso: infra/local/clean-machine.sh.
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

# git (o bake usa o SHA do commit), curl e openssl (local:check), certutil (local:trust no Linux).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gnupg iptables libnss3-tools openssl procps \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
    > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends containerd.io docker-buildx-plugin docker-ce docker-ce-cli docker-compose-plugin \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/clean-machine-entrypoint
WORKDIR /work
ENTRYPOINT ["clean-machine-entrypoint"]
CMD ["bash"]
