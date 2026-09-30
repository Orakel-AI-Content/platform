# 0008 – Operação: ambiente local, CI, imagens, logs e erros

- Status: aceito
- Data: 2026-09-29

## Contexto

Fase 0: ambiente local ponta a ponta em containers, antes do primeiro deploy. CI no
GitHub Actions Free (repositório privado: 2.000 min/mês), sem segredos. Orçamento de
infraestrutura mínimo.

## Decisão

- **Ambientes:** local e produção, sem staging. Só as variáveis de `.env.example`
  mudam entre eles.
- **Compose:** base em `infra/vps/compose.yaml`, override em
  `infra/local/compose.override.yaml`. Serviços de apoio: Postgres 18.6 e SeaweedFS 4.48
  (emulador S3), presos por tag + digest. O MinIO deixou de publicar imagens da edição
  comunitária.
- **Comandos** (_proposta_): `pnpm local:up` (sobe e migra), `local:seed`,
  `local:down`, `local:reset` (apaga volumes), `local:images`, `local:e2e`; `local:check`,
  `local:publish` e `local:load` no ADR 0015.
- **CI (`ci.yml`):** filtros de caminho (`dorny/paths-filter`) em quatro grupos (sites e
  pacotes; backoffice e serviços; infra; só docs), `turbo --affected`, cancelamento de
  execuções antigas. Os jobs de contrato, sites de exemplo, axe e paridade chamam
  tarefas do Turbo, que não fazem nada até uma unidade defini-las.
- **Imagens (`images.yml`):** `docker buildx bake` com `docker/docker-bake.hcl`,
  publicação no GHCR com `GITHUB_TOKEN`, tag = SHA do commit, 30 versões mantidas.
  Plataforma `linux/amd64` (a da VPS) no CI; no `pnpm local:images`, a da máquina (as
  imagens locais não são publicadas; amd64 num Mac Apple Silicon roda emulado).
- **Release (`release.yml`):** tag `core-v*` → imagem `site-builder`; pula enquanto o
  Dockerfile não existir.
- **E2E (`e2e.yml`):** só manual (`workflow_dispatch`) ou local (`pnpm local:e2e`).
- **Logs:** pino (JSON) nos processos Node; console JSON nos Workers; Sentry desligado
  com `SENTRY_DSN` vazio; heartbeat dos jobs em `HEARTBEAT_BASE_URL`; sem tracing.
- **Erros:** o domínio devolve erro esperado como valor (união discriminada, estilo
  `safeParse`); inesperado lança; as bordas traduzem para `application/problem+json`
  (RFC 9457) ou código de saída.
- **Deploy:** sites e Worker na Cloudflare; backoffice na VPS com compose; OpenTofu e
  Ansible entram no primeiro deploy.

## Alternativas consideradas

- Garage (passos de layout e chaves; AGPL), RustFS (novo demais), MinIO da Chainguard
  (gratuito só em `:latest`).
- OpenTelemetry — pesado para a fase 0.
- `neverthrow` ou exceções tipadas em todo lugar.

## Consequências

- `actions/checkout` com `fetch-depth: 0` para o `--affected`.
- Provedor S3 de produção e local dos segredos de produção ficam em aberto até o
  primeiro deploy.
