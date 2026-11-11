# 0008 – Task build: containers do site-builder pelo proxy do Docker

- Status: aceito (completa o 0002 e o 0006)
- Data: 2026-10-01

## Contexto

A L3 do `12.0` fecha o caminho mudança → build → site: o `build-runner` executa o `render` e o
`publish` da imagem `site-builder` (contrato do volume no ADR 0002 do build-site), pela API do
Docker via `docker-socket-proxy` (ADR 0011 da raiz). Até aqui a task `build` só falhava.

## Decisão

- **Disparo:** `recordPendingChange` agenda o build na mesma transação (`scheduleBuild`, agora
  em `src/domain/builds/schedule.ts`): fila `build:<site>`, `job_key` por site e janela
  `BUILD_WINDOW_SECONDS` (900 em produção, 30 no local), aplicada na partida de cada
  processo. "Publicar agora" (`requestBuildNow`, `operations.run`) regrava o job para já; site
  pausado é recusado.
- **Cliente Docker:** `fetch` sobre `DOCKER_HOST` (`src/lib/docker.ts`), só com as rotas da
  lista do proxy; o fim do container é acompanhado por consulta ao estado (sem conexão longa).
  Os arquivos de resultado são lidos com `GET /containers/{id}/archive` (rota acrescentada ao
  proxy, só leitura) e um leitor de tar mínimo. Sem dependência nova.
- **Execução** (`runBuild`, sobre a interface `ContainerRuntime`): imagem
  `site-builder:<release do site>` (ou `SITE_BUILDER_TAG` antes da primeira promoção; ausente
  no host → permanente, porque o proxy recusa pull); volume por tentativa; `render` na rede
  `orakel-export` (3 vCPU, 6 GB, `CpuShares` 256, 20 min); `publish` na `orakel-publish`
  (10 min). Containers sem capabilities e com `no-new-privileges`; containers e volume sempre
  removidos.
- **Classificação:** o `result.json`/`publish.json` decide; sem arquivo, o código de saída (10
  permanente, o resto transitório); tempo estourado e erro do runtime são transitórios.
- **Registro:** tabela `builds`, uma linha por tentativa (release, tentativa, etapa e motivo da
  falha, páginas, arquivos, versão publicada, `cacheKey`, durações). Com sucesso, a mesma
  transação baixa as mudanças pela lista `pendingChangeIds` do snapshot e marca o site
  `publicado`. A versão ativa (último build `ok`) dá o `ACTIVE_PAGE_COUNT` da trava.
- **Execução com estado (#630):** a linha deixa de nascer pronta. `status` tem `na_fila` e
  `rodando` (linhas abertas, sem `finished_at`) e `ok`, `failed` e `cancelado` (fechadas); o
  `CHECK` `builds_finished_check` amarra o estado aberto ao `finished_at` nulo. `kind` separa
  `build` de `rollback`. A task `build` grava a linha `rodando` antes do `runBuild`
  (`startBuild`), fora da transação do resultado, para ela ser vista enquanto a execução
  acontece; `recordBuild` fecha essa mesma linha por `update`, na transação que aplica os
  efeitos no site. Continua valendo uma linha por tentativa: a aberta e a fechada são a mesma
  (`job_id` + `attempt`). As consultas de versão ativa, versões do "Reverter", último build e
  builds recentes só leem linhas `kind = build` fechadas (`ok`, ou `ok`/`failed`).
  `current_stage`, `requested_by` (e-mail ou `system`), `scheduled_for` e `log_tail` nascem
  aqui e são preenchidas pelas issues seguintes (#631, #632, #633), como as linhas `na_fila`,
  `cancelado` e `rollback`.
- **Falhas:** transitória lança e o Graphile Worker repete (até 5, backoff exponencial);
  permanente pausa o site com `<etapa>: <motivo>`; site pausado não é construído.
- **Estado do site:** `src/domain/builds/site-state.ts` grava só colunas operacionais, sem
  mudança pendente (senão cada build agendaria outro); liberado no teste de varredura.
- **Contrato:** importado de `@orakel/build-contract` (só Zod), não do `@orakel/build-site`,
  para a imagem do backoffice não levar astro, wrangler e workerd.

## Alternativas consideradas

- `dockerode`: dependência para oito chamadas, e rotas fora da lista ficariam a um método de
  distância.
- Resultado pelo log do container: duplicaria o contrato do volume.
- `POST /containers/{id}/wait`: conexão longa, sujeita aos limites de tempo do `fetch`.
- Renomear `ok`/`failed` para o idioma dos estados novos: reescreveria as linhas gravadas; a
  migração da #630 só acrescenta colunas e relaxa `NOT NULL`/`DEFAULT` de `started_at` e
  `finished_at`.
- `finished_at` obrigatório com valor provisório na linha aberta: data falsa, e a ordenação
  por `finished_at` poria a linha aberta no topo das consultas.
- Linha `rodando` na mesma transação do resultado: só apareceria ao fim da execução.

## Consequências

- Verificado no ambiente local: mudança → build 30 s depois; trava → site pausado com o motivo
  e a versão anterior no ar; `edge-local` fora → falha transitória e sucesso na 2ª tentativa;
  nenhum container ou volume restante.
- Retomar o site, rollback e reconstruir em outra release: L4 (Registro de instâncias).
- **Recuperação na partida (#453):** o Graphile Worker só solta a trava de um worker morto
  depois de 4 h, e a fila `build:<site>` deixaria o site sem build até lá. Antes do `run()`, o
  `build-runner` chama `recoverInterruptedBuilds` (`src/domain/builds/recover.ts`): a linha
  `rodando` de cada job `build` travado (mesmo `job_id` e `attempt`) é fechada como
  `failed`/`transient` ("build interrompido…"), sem inserir outra; só quando o processo morreu
  antes de gravá-la a linha é inserida já fechada (com `started_at` = `locked_at`), e os donos das travas dos jobs `build` e das
  filas `build:%` são liberados com `graphile_worker.force_unlock_workers`, numa transação. O
  job volta à fila com a tentativa já contada; a política de retry segue igual. Toda trava
  presente na partida é tratada como de um processo morto, o que só vale enquanto houver um
  `build-runner` por ambiente (dois em paralelo exigem rever esta decisão). Travas das outras
  tasks não são tocadas, e os containers órfãos da tentativa ficam para uma issue própria (o
  proxy não lista containers).
- O `build-runner` tem `stop_grace_period` de 1.830 s (render + publish + 30 s): um deploy
  normal espera o build em andamento terminar em vez de cortá-lo.
