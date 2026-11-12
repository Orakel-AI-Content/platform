# 0018 – Versão do site-builder

- Status: aceito (substitui a parte "Release do core" do 0005)
- Data: 2026-11-10 (revisado em 2026-11-11: o gatilho do `release.yml` passa a ser
  `workflow_dispatch`, #657)

## Contexto

O ADR 0005 chamou a versão publicada do gerador de sites de "release do core", com tag
Git `core-vX.Y.Z`. Mas "core" também é o nome do pacote `@orakel/core` (rotas, head,
JSON-LD, sitemap, RSS, robots). Quem lê a documentação ou opera o Backoffice não sabe se
"core" é o pacote ou a imagem, e essa confusão já escondeu uma divergência entre a tag
Git e a tag da imagem (#566). Nenhuma tag `core-v*` foi publicada até aqui.

## Decisão

- O que se versiona é a imagem `site-builder`, e o nome do conceito é **versão do
  site-builder**. "Core" passa a designar só o pacote `@orakel/core`.
- Uma versão tem três formas, sempre com o mesmo `X.Y.Z`:
  - **Tag Git:** `site-builder-vX.Y.Z`, na `main`, criada pelo `release.yml` no fim do
    run, depois de a imagem ser publicada. Ninguém cria a tag à mão.
  - **Tag da imagem:** `site-builder:X.Y.Z`, publicada pelo `release.yml` com o prefixo
    `site-builder-v` removido.
  - **Valor registrado no Backoffice:** `X.Y.Z`, igual à tag da imagem (#566).
- O `release.yml` só dispara por `workflow_dispatch`, com o input `version` (`X.Y.Z`),
  disparado pelo Backoffice (workspace#81). Antes do E2E, ele recusa número fora do
  formato, disparo fora da `main` e tag já existente. Push de tag não dispara nada.
- A semântica herdada do 0005 continua valendo: major muda o schema da API ou exige
  migração de configuração; minor, funcionalidades; patch, correções. Merge na `main`
  não cria versão.
- "Build" continua sendo só a execução da imagem para um site (tabela `builds`, task
  `build`).

## Alternativas consideradas

- Manter `core-v` e corrigir só o glossário: a tag continuaria dizendo "core", e a
  ambiguidade ficaria no histórico do Git.
- Um nome com "build" (`site-build`, `build-v`): "build" já é a execução por site.
- Renomear o pacote `@orakel/core` ou a imagem: custa mais e não resolve nada que a troca
  do nome do conceito já não resolva.
- Manter o gatilho por push de tag ao lado do `workflow_dispatch`: seriam duas fontes do
  número, e a tag criada antes do CI gastaria o número num release que falha. A tabela
  `releases` do Backoffice passa a ser a única fonte do próximo número.

## Consequências

- O `release.yml` dispara por `workflow_dispatch` e cria a tag `site-builder-vX.Y.Z` no
  commit do run só depois de publicar a imagem; `contents: write` fica só nesse job. Um
  release que falha não deixa tag, e o mesmo número pode ser tentado de novo.
- A documentação deixa de dizer "release do core".
- Os ADRs antigos que citam `core-vX.Y.Z` (0001, 0005, 0007 e 0008 da raiz e 0001 do
  build-site) ficam como registro histórico; este ADR os substitui nesse ponto.
- Como nenhuma tag `core-v*` foi publicada, o histórico só terá um prefixo.
- Os textos do Backoffice são trocados numa segunda fatia (#568).
