# 0005 – Imagem local, compose e Caddy

- Status: aceito
- Data: 2026-09-30

- Imagem `infra/local/edge-local/Dockerfile` em `node:24.21.0-bookworm-slim` por digest (workerd exige glibc); `turbo prune @orakel/edge-local @orakel/blog-worker` (o Worker real entra para os testes, que rodam na construção). Usuário `node`, `/data` do usuário `node`.
- Bake: alvo `edge-local` no grupo `local` (só o `pnpm local:images`; o `images.yml` não publica).
- `compose.override.yaml`: serviço `edge-local` com o volume `edge-local-data:/data`, healthcheck em `/healthz`, sem portas na máquina.
- Caddy: `*.localhost` → `edge-local:8080` (os blocos `admin.` e `preview.` têm prioridade).
- Redes `publish` (administração, pelo `publish` do site-builder) e `edge` (sites, pelo Caddy; ClickHouse), definidas no scaffold do ambiente local (ADR 0010 da raiz).
