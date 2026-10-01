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

## Consequências

- Verificado no ambiente local: mudança → build 30 s depois; trava → site pausado com o motivo
  e a versão anterior no ar; `edge-local` fora → falha transitória e sucesso na 2ª tentativa;
  nenhum container ou volume restante.
- Retomar o site, rollback e reconstruir em outra release: L4 (Registro de instâncias).
