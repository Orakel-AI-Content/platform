# 0028 – Remoção do Worker pelo build-runner

- Status: aceito
- Data: 2026-11-13

## Contexto

Remover a infraestrutura de um site pausado pelo Backoffice (workspace#97) começa por tirar do
ar o Worker do site, `orakel-<site>`. Ele é criado pelo `wrangler deploy` do container
`publish`, fora do OpenTofu, então o `plan -destroy` da ADR 0027 não o vê, e ele precisa sair
antes da zona. Até aqui, o `CLOUDFLARE_API_TOKEN` de deploy fica só no `build-runner`, que
apenas o repassa aos containers da `site-builder` (`publish` e rollback), sem chamar a
Cloudflare por conta própria.

O entrypoint de cada container é o da release do site. Um site preso a uma release antiga não
teria um entrypoint novo de remoção, e a remoção não pode depender de o site estar na release
mais recente.

## Decisão

- O `build-runner` passa a usar o token de deploy direto, numa única chamada:
  `DELETE /accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/scripts/orakel-<site>`, sem `force`. É o
  cliente `cloudflareWorkerRemover` de `apps/backoffice/src/lib/cloudflare.ts`, no molde do
  `cloudflareZoneChecker` (ADR 0025): `fetch` puro, token só no cabeçalho `Authorization`,
  nenhuma mensagem o repete.
- O resultado é um valor: `removido`, `inexistente` ou `falha` com `transient`. 404 da API é
  `inexistente` e conta como sucesso, para que "Tentar de novo" não trave. Rede, falta de
  resposta, 429 e 5xx são transitórios; 401, 403 e os demais 4xx são definitivos.
- Sem `force`: o Worker do site não é alvo de binding de outro script. Se passar a ser, a
  recusa aparece como falha definitiva, em vez de apagar o que depende dele em cascata.
- No local (`DEPLOY_TARGET=local`), o mesmo papel é a rota `DELETE /sites/{site}` do edge-local
  (ADR 0003 da unidade), que desliga a instância, tira o site do proxy e apaga as versões;
  `edgeLocalWorkerRemover` a chama, e `workerRemoverFrom` escolhe o modo.
- O nome do Worker passa a ter uma única definição, `workerName` em `@orakel/build-contract`,
  usada pela `site-builder`, pelo edge-local e pelo Backoffice.
- Nenhum segredo muda de lugar: o token de deploy continua só no `build-runner` (e no
  `publish`); não vai ao `backoffice-worker` nem ao container de infra.

## Alternativas consideradas

- Entrypoint `unpublish` na `site-builder`: dependeria da release do site, e um site em release
  antiga não o teria.
- `wrangler delete` no `build-runner` ou no `infra-runner`: a imagem do Backoffice não tem o
  `wrangler`, e o token de deploy chegaria ao container de infra.
- Repetir `orakel-${site}` no Backoffice: duas definições do mesmo nome que podem divergir.
- `force=true`: apagaria em silêncio o que dependesse do Worker.

## Consequências

- O token de deploy precisa da permissão **Workers Scripts: Edit** na conta, que o `wrangler
deploy` já exige; nada muda no token.
- O `build-runner` já tem saída para a internet pela rede `internal`. No local, ele ainda não
  alcança a API de administração do edge-local (só na rede `publish`): a cadeia da remoção
  (platform#840) liga o `build-runner` à `publish` no `infra/local/compose.override.yaml`, e o
  `local:check` confere `build-runner → edge-local`.
- A remoção do Worker é o primeiro elo da cadeia da remoção, na fila `infra:<site>`: a task
  `infra-remove-worker` do `build-runner` grava a etapa `paginas`, apaga o Worker e enfileira o
  esvaziamento de `media-<site>` no `backoffice-worker` (`empty-site-media`), que enfileira o
  `infra-apply` do plano de destruição. Cada elo enfileira o próximo na mesma transação em que
  grava a etapa, numa tentativa só; a falha fecha a execução com a etapa do elo. Na partida, cada
  processo só recupera os jobs das próprias tasks e só solta as travas dos donos desses jobs, para
  não derrubar o elo que o outro está rodando.
- Só a nuvem valida a remoção de verdade com o token restrito ao IP da VPS.
