# 0023 – Driver local da release

- Status: aceito (revisa o 0022: sem o PAT, o build-runner não sobe com o driver `github`)
- Data: 2026-11-11

## Contexto

"Gerar nova versão" (workspace#81) dispara o `release.yml` e baixa a imagem do GHCR (ADRs 0021
e 0022). No ambiente local não há PAT nem GHCR para isso, e o fluxo precisa funcionar ali e no
E2E sem serviço externo. A imagem `site-builder:local` já existe no host, construída pelo
`pnpm local:images`.

## Decisão

- `RELEASE_DRIVER` no `BuildRunnerEnvSchema`: `github` (padrão) ou `local`. O
  `infra/local/compose.override.yaml` fixa `local` (`LOCAL_RELEASE_DRIVER` troca, como o
  `LOCAL_LLM_MODEL` da geração).
- Driver `github`: o de antes. O schema exige `GITHUB_RELEASE_TOKEN`; sem ele, o build-runner
  não sobe, em vez de subir e falhar cada release.
- Driver `local`: o job `release-run` leva a release de `gerando` a `baixando` na hora, sem
  rede e sem run (`runId` e `runUrl` nulos). O `check-release-image` confere
  `SITE_BUILDER_IMAGE:SITE_BUILDER_TAG` no host e a etiqueta como `X.Y.Z` por `tagImage` no
  `ContainerRuntime`. Sem a imagem de origem, a release vai a `falhou` na primeira tentativa,
  com o motivo que manda rodar `pnpm local:images` (repetir não a traz).
- `tagImage` só aceita origem e alvo `SITE_BUILDER_IMAGE:<tag>`, como o `pullImage`.
- A rota `POST /images/<nome>/tag` só é liberada no `docker-socket-proxy` do override local,
  que repete a lista da VPS inteira (o compose troca o `command`). O `pnpm local:check` confere
  que ela é aceita no local e que não aparece em `infra/vps/compose.yaml`.

## Alternativas consideradas

- GitHub falso no local: fingiria um run com link que não existe e ainda exigiria um
  registry para o pull.
- `docker tag` por script no host: fora do build-runner e do proxy, e o fluxo do Backoffice
  pararia em `baixando`.
- Liberar a rota de tag também na VPS: produção não etiqueta imagem; seria permissão a mais no
  proxy sem uso.
- Manter o build-runner subindo sem o PAT com o driver `github`: cada "Gerar nova versão"
  falharia com o mesmo motivo; o erro no boot aparece antes e no lugar certo.

## Consequências

- Produção precisa do `GITHUB_RELEASE_TOKEN` antes do deploy desta versão (passo 3 do 0022),
  ou o build-runner não sobe.
- No local, uma versão `X.Y.Z` é uma cópia da `site-builder:local` do momento: reconstruir a
  imagem depois não muda as versões já geradas.
- Mudou a lista de rotas do proxy na VPS: repita no override local.
