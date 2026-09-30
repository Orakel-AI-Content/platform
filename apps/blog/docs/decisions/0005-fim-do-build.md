# 0005 – Fim do build: arquivos da borda, fontes, busca e orçamento

- Status: aceito
- Data: 2026-09-30

## Contexto

A integração do Astro roda em Node, fora do Vite, e não tem acesso às coleções; ler o snapshot de novo quebraria a leitura única.

## Decisão

- O endpoint `/orakel-edge.json` (prerenderizado com as coleções) leva: os arquivos de `edgeFiles` do core, o manifesto de eventos (`buildEventManifest` do events em `/_data/events-manifest.json`), as fontes do tema (`themeFonts`), a flag de busca e o `redirectUsage`. Problemas do core e tema inexistente viram `BuildError` permanente ali.
- `src/integrations/site-files.ts`, no `astro:build:done`: lê e apaga o JSON; grava os arquivos; copia as fontes de `@orakel/tokens/fonts/` para `/fonts/`; gera o índice do Pagefind (páginas com `data-pagefind-body`); confere o orçamento de JS (ADR 0010); acrescenta `redirectUsage` ao `metaFile` do render.

## Pagefind pela CLI

O índice é gerado pela CLI do Pagefind num processo filho, e não pela API Node: com `writeFiles` + `close`, o processo do Pagefind às vezes era encerrado antes do fim da escrita, e o CI pegou dois builds do mesmo snapshot com `pagefind-ui.js` diferente. Com o processo terminado, os arquivos estão todos gravados.

## Consequências

Tudo que sai do build vem de uma leitura do snapshot. Falha em qualquer passo interrompe o build com a classificação certa.
