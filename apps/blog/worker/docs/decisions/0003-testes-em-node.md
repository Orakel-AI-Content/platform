# 0003 – Testes em Node, com Vitest 5

- Status: aceito
- Data: 2026-09-29

## Contexto

A raiz fixa o Vitest 5.0.2 no `catalog` estrito. O `@cloudflare/vitest-pool-workers`
0.22, que roda testes dentro do workerd, exige Vitest ^4.1 e ainda não tem versão para o 5.

## Decisão

- Vitest 5 em Node: regras puras, o fluxo `pageview.ts`, o cache do manifesto e o
  `index.ts` com um `env` falso (`ASSETS.fetch` e `EVENTS.writeDataPoint` como dublês) e
  um `Request` do Node com `cf` acrescentado.
- Sem meta de cobertura (a raiz só a exige nos pacotes de contrato).
- O comportamento no workerd real (Static Assets, `run_worker_first`, 404 própria) é
  conferido com `pnpm dev` (`wrangler dev`), no ambiente local (L3 e L6, com o
  `edge-local`) e no piloto. Na geração, uma prova com `wrangler dev` confirmou os
  status de cada caminho.

## Alternativas consideradas

- Vitest 4.1 só nesta unidade, com catálogo nomeado: divergiria de "uma versão por
  dependência" (ADR 0003 da raiz), e o `@orakel/vitest-config` depende do Vitest 5.
- Vitest 5 + `unstable_startWorker` do wrangler: API instável e testes mais lentos.

## Consequências

Quando o `vitest-pool-workers` suportar Vitest 5, o Renovate avisa e os testes do
`index.ts` passam para o workerd (pendência no spec).
