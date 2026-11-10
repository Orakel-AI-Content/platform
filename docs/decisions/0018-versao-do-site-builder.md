# 0018 – Versão do site-builder

- Status: aceito (substitui a parte "Release do core" do 0005)
- Data: 2026-11-10

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
  - **Tag Git:** `site-builder-vX.Y.Z`, manual, na `main`. O `release.yml` dispara nela.
  - **Tag da imagem:** `site-builder:X.Y.Z`, publicada pelo `release.yml` com o prefixo
    `site-builder-v` removido.
  - **Valor registrado no Backoffice:** `X.Y.Z`, igual à tag da imagem (#566).
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

## Consequências

- O `release.yml` dispara em `site-builder-v*.*.*`, e a documentação deixa de dizer
  "release do core".
- Os ADRs antigos que citam `core-vX.Y.Z` (0001, 0005, 0007 e 0008 da raiz e 0001 do
  build-site) ficam como registro histórico; este ADR os substitui nesse ponto.
- Como nenhuma tag `core-v*` foi publicada, o histórico só terá um prefixo.
- Os textos do Backoffice são trocados numa segunda fatia (#568).
