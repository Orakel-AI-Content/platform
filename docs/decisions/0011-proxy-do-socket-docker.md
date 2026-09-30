# 0011 – Proxy do socket do Docker

- Status: aceito
- Data: 2026-09-30

## Contexto

O `build-runner` cria os containers `render` e `publish` pela API do Docker. O socket dá root no
host. Spike da L0: proxy com permissões mínimas ou Docker rootless.

## Decisão

- `wollomatic/socket-proxy` 1.13.1 (tag + digest), com uma lista de rotas por método (regex):
  - `HEAD`/`GET`: `_ping`, `version`, `containers/<id>/(json|logs)`, `images/<nome>/json`,
    `volumes/<nome>`;
  - `POST`: `containers/create`, `containers/<id>/(start|wait|kill)`, `volumes/create`;
  - `DELETE`: `containers/<id>`, `volumes/<nome>`.
- Recusa todo o resto: `exec`, `pull`, `build`, redes, `system`, plugins.
- Só aceita conexões do `build-runner` (`-allowfrom`); fica na rede `orakel-docker`.
- Roda como `65534` com o grupo do socket (`DOCKER_SOCKET_GID`: 0 no Docker Desktop, o gid do
  grupo `docker` na VPS), `read_only`, `cap_drop: ALL`, `no-new-privileges`, socket `:ro`.
- O corpo do `containers/create` (imagem, redes, limites, sem `privileged`, sem mounts do
  host) é garantido pelo código do `build-runner`, com testes — o proxy filtra só a rota.

## Alternativas consideradas

- `tecnativa/docker-socket-proxy`: permissões por seção; com `CONTAINERS=1` e `POST=1`, libera
  qualquer `POST` em containers, sem escolher a rota.
- Docker rootless: isola melhor, mas muda a instalação da VPS e o Docker Desktop local não o
  reproduz. Reavaliar no primeiro deploy.

## Consequências

- `pnpm local:check` confere, a partir do `build-runner`, que `GET /version` passa e que
  `exec`, `pull` e `GET /networks` são recusados.
- Rota nova no `build-runner` exige mudar a lista no compose.
