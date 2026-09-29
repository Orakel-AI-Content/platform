# 0005 – Imagem Docker só de teste

- Status: aceito
- Data: 2026-09-29

## Contexto

O pacote é consumido como fonte TypeScript e não roda como processo: chega ao ar dentro
das imagens de quem o consome. Mesmo assim, foi pedido um jeito de rodar lint, tipos e
testes num ambiente limpo e reproduzível. A regra da raiz põe toda imagem nova no grupo
`images` ou `release` do bake, e os dois grupos são publicados no GHCR.

## Decisão

- `Dockerfile` em várias etapas: `turbo prune @orakel/content-model --docker` →
  `pnpm install --frozen-lockfile --ignore-scripts` →
  `pnpm turbo run lint typecheck test --filter=@orakel/content-model`. A construção falha
  se algum passo falhar; não há imagem de execução.
- Alvo `content-model-test` em `docker/docker-bake.hcl`, **fora** dos grupos `images` e
  `release`, com `output = ["type=cacheonly"]`. Uso: `docker buildx bake content-model-test`.
- Não roda no CI: o job `quality` já roda os mesmos passos direto, e o container
  gastaria minutos do plano Free.
- **Diverge da regra da raiz** de `.claude/rules/infra.md`, que passa a citar a exceção.

## Alternativas consideradas

- Sem container (recomendação original): menos arquivos; o CI e o Node fixado já dão
  reprodutibilidade.
- Rodar a imagem no CI: redundante com o job `quality`.

## Consequências

- A raiz ganhou `.dockerignore` (contexto sem `node_modules`, saídas nem `.env`).
- Mudou a versão do Turbo ou do Node na raiz? Atualize o `Dockerfile`.
