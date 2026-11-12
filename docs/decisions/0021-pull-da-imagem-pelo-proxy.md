# 0021 – Pull da imagem do site-builder pelo proxy do socket

- Status: aceito (substitui em parte o 0011: a recusa do `pull`)
- Data: 2026-11-11

## Contexto

Para gerar uma versão do motor pelo Backoffice, sem `docker pull` no terminal da VPS
(workspace#81), o `build-runner` precisa baixar a imagem `site-builder` da release. O 0011
recusa o `pull` no `docker-socket-proxy`. O `wollomatic/socket-proxy` filtra só método e
caminho por regex: não enxerga a query `fromImage` de `POST /images/create`.

## Decisão

- A mesma instância do proxy libera `POST /images/create` no `-allowPOST`, e nada mais de
  novo (`push`, `load`, `build`, `exec` e redes continuam recusados).
- O nome da imagem é garantido pelo código, como o corpo do `containers/create`: o
  `dockerRuntime` recebe o `SITE_BUILDER_IMAGE` ao ser criado e `pullImage` só aceita
  `SITE_BUILDER_IMAGE:<tag>` (sem digest, sem outro repositório), com testes.
- `pullImage` lê o progresso (NDJSON) até o fim e trata como erro qualquer linha com
  `error`: o Docker responde 200 mesmo quando o pull falha.
- O pull não usa credencial: o pacote `site-builder` é público.
- O build com a imagem ausente tenta o pull uma vez antes de falhar na etapa `image`. O
  rollback e a conferência da imagem da release continuam só conferindo.

## Alternativas consideradas

- Segunda instância do proxy, só com `images/create`: o proxy também não enxergaria o nome
  da imagem, então isolaria igual e acrescentaria um serviço.
- Validar o nome só em quem chama (`runBuild`): o runtime aceitaria qualquer imagem vinda de
  outro chamador.

## Consequências

- O `build-runner` passa a poder baixar qualquer imagem, se o código for contornado: a
  proteção é o código e os testes, não o proxy.
- `pnpm local:check` confere que o pull é aceito (nome inválido, recusado pelo daemon sem ir
  ao registry) e que `exec` e `GET /networks` continuam recusados.
