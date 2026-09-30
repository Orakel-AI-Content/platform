---
paths:
  - 'infra/**'
  - 'docker/**'
---

# Compose e imagens

- `infra/vps/compose.yaml` é a base de produção; o local só acrescenta em `infra/local/compose.override.yaml` (portas e substitutos da nuvem). Não duplique serviços.
- Todo serviço declara `networks:` (ADR 0010): quem fala com quem é decisão, não padrão. A `orakel-export` e a `orakel-docker` não têm internet.
- Rota nova do Docker no `build-runner` → lista do `docker-socket-proxy` (ADR 0011). Serviço one-shot novo → `ONE_SHOT` do `infra/local/check.sh`.
- Mudou rede, bucket ou hostname → rode `pnpm local:check` (e acrescente a verificação lá).
- Imagens de apoio presas por tag de minor + digest (`imagem:X.Y@sha256:…`).
- Variáveis que mudam entre local e produção vêm do `.env.local` / ambiente e constam em `.env.example`; nunca valores reais nos arquivos.
- Portas locais só em `127.0.0.1`.
- Imagem nova: `Dockerfile` da unidade com `turbo prune --docker` + alvo em `docker/docker-bake.hcl` no grupo `images` ou `release`. O grupo `local` (ex.: `edge-local`) só é construído pelo `pnpm local:images` e nunca é publicado. A `site-builder` (grupo `release`) é construída e testada pela fumaça (`tooling/build-site/scripts/smoke.sh`) em todo PR que a afeta. Imagem só de teste fica fora dos grupos (`content-model-test`, `content-client-test`, `core-test`, `elements-test`, `events-test`, `tokens-test`).
- Valide com `infra/local/compose.sh config --quiet` e `docker/bake.sh default --print`.
  Detalhes: `docs/decisions/0008-operacao.md`, ADRs 0010–0015, `docs/guides/local-setup.md`
