# 0006 – Fontes no tema, auto-hospedadas pelo blog

- Status: aceito
- Data: 2026-09-29

## Decisão

- Arquivos `.woff2` em `themes/<id>/fonts/`, com a licença ao lado (`<nome>.LICENSE.txt`), commitados.
- Origem: pacotes variáveis do Fontsource, já em subset latino (cobre os acentos do português), baixados por `pnpm fonts` (`scripts/subset-fonts.ts`, `npm pack` em versão fixada). Roda à mão, fora do build: sem Python, sem dependência no catalog.
- `fontFaces` na extensão do tema: família, arquivo, peso (ou intervalo variável), estilo e `preload` (só a fonte do texto).
- O build grava `dist/fonts/<nome>.<hash>.woff2` e o CSS do tema aponta para `/fonts/<nome>.<hash>.woff2`, com `font-display: swap`.
- O blog copia os arquivos (resolvendo `@orakel/tokens/fonts/<file>` na configuração do Astro, que roda no Node), põe o `<link rel="preload">` da fonte do texto e serve `/fonts/*` como `immutable` no `_headers`.
- A pilha de fallback fica no token de família. Ajuste de métricas (`size-adjust`) fica para depois.

## Temas de exemplo

- `exemplo-a` (claro): Inter (texto) e Source Serif 4 (títulos).
- `exemplo-b` (escuro): Work Sans (texto) e Space Grotesk (títulos).
