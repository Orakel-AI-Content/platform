---
paths:
  - 'infra/**'
  - 'docker/**'
---

# Compose e imagens

- `infra/vps/compose.yaml` é a base de produção; o local só acrescenta em `infra/local/compose.override.yaml` (portas, emulador S3). Não duplique serviços.
- Imagens de apoio presas por tag de minor + digest (`imagem:X.Y@sha256:…`).
- Variáveis que mudam entre local e produção vêm do `.env.local` / ambiente e constam em `.env.example`; nunca valores reais nos arquivos.
- Portas locais só em `127.0.0.1`.
- Imagem nova: `Dockerfile` da unidade com `turbo prune --docker` + alvo em `docker/docker-bake.hcl` no grupo `images` ou `release`. Imagem só de teste fica fora dos grupos (`content-model-test`, `content-client-test`, `core-test`, `elements-test`, `events-test`, `tokens-test`).
- Valide com `infra/local/compose.sh config --quiet` e `docker/bake.sh default --print`.
  Detalhes: `docs/decisions/0008-operacao.md`, `docs/guides/local-setup.md`
