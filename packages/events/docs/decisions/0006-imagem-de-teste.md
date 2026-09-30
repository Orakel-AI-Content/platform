# 0006 – Imagem Docker só de teste

- Status: aceito
- Data: 2026-09-29

## Contexto

O `content-model` ganhou uma imagem só de teste (ADR 0005 daquela unidade). O `events`
também não roda como processo: chega à borda dentro do Worker e ao agregador dentro da
imagem do backoffice.

## Decisão

Mesmo padrão: `Dockerfile` com `turbo prune @orakel/events --docker` →
`pnpm install --frozen-lockfile --ignore-scripts` →
`pnpm turbo run lint typecheck test --filter=@orakel/events`; alvo `events-test` no
`docker/docker-bake.hcl`, fora dos grupos `images` e `release`, fora do CI.
Uso: `docker buildx bake events-test`.

## Alternativas consideradas

Sem container: menos arquivos, mas quebra a simetria entre os pacotes de domínio.

## Consequências

Mudou a versão do Turbo ou do Node na raiz? Atualize o `Dockerfile`.
