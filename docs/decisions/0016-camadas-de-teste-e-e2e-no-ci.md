# 0016 – Camadas de teste do Backoffice e E2E completo no CI

- Status: aceito (substitui o "E2E só manual" do 0008)
- Data: 2026-10-22

## Contexto

O E2E do Backoffice roda contra o ambiente local inteiro (Caddy, access-mock, imagem do
Backoffice, Postgres, S3, edge-local, build-runner). Com várias sessões em paralelo na mesma
máquina, rodar a suíte completa em cada uma saturava CPU e memória. O 0008 deixava o
`e2e.yml` só manual, então a suíte completa não tinha lugar garantido para rodar.

## Decisão

Três camadas, da mais barata para a mais cara:

1. **Componente:** a vitrine de componentes (`components.spec.ts`) migra para o Vitest
   Browser Mode (#457–#459), sem ambiente local.
2. **E2E da área, local:** a sessão roda só o spec da área que tocou ou as jornadas
   `@smoke` (`pnpm local:e2e:area`), numa das vagas da máquina (`E2E_SLOTS`), com 2 workers.
3. **Suíte completa, no CI:** o `e2e.yml` roda em todo PR que muda `apps/backoffice/**`,
   `packages/**`, `infra/local/**`, `docker/**` ou o `pnpm-lock.yaml` (e no
   `workflow_dispatch`), incluindo os testes `@perf`.
   - Um job `images` constrói o grupo `default` do bake (backoffice, edge-local,
     site-builder) só para o cache `type=gha`, com um escopo por alvo; cada shard recarrega
     as imagens do cache com `--load`.
   - Imagens e compose usam a mesma tag, o SHA (`TAG` e `BACKOFFICE_TAG`, `EDGE_LOCAL_TAG`,
     `SITE_BUILDER_TAG`): no CI o bake não gera a tag `local`.
   - 2 shards (`playwright test --shard=N/2`), 30 min cada; cada shard lista os seus
     testes no log e publica relatório HTML e traces como artefato.

O E2E não é obrigatório para o merge; a proteção de branch fica para depois de algumas
semanas de estabilidade.

## Alternativas consideradas

- Manter o E2E só manual: a suíte completa não rodaria em lugar nenhum por mudança.
- Passar as imagens aos shards como artefato (`docker save`/`load`): centenas de MB
  subindo e descendo por shard, mais lento que o cache do buildx da mesma execução.
- Acrescentar a tag `local` às imagens no CI: mudaria o `docker-bake.hcl` que também
  serve ao `images.yml` e ao `release.yml`.
- Um único job sem shards: a suíte inteira, com os `@perf`, num só runner e num só timeout.

## Consequências

- Cada PR do Backoffice gasta minutos do plano Free (2.000 min/mês) em três jobs; os
  filtros de caminho e o `concurrency` com cancelamento limitam o custo.
- Rebalancear os arquivos entre os shards ou ligar `fullyParallel` fica para quando o
  tempo dos shards divergir.
