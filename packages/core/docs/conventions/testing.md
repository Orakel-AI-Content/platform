# Testes do core

- Meta de 90% de linhas e branches (raiz). Rodar: `pnpm test` · com relatório: `pnpm vitest run --coverage`.
- Base: as fixtures `exemplo-a` e `exemplo-b` do `content-model`, validadas como no build (`test-snapshots.ts`). Cada caso parte de uma cópia (`changed`) e altera só o que verifica; `indexable` liga a flag.
- Arquivos gerados (head do artigo, `robots.txt`, `_headers`, RSS, sitemaps) têm snapshot em `__snapshots__/`. Mudou a saída de propósito? `pnpm vitest run -u` e revise o diff do snapshot no PR.
- Casos obrigatórios: escape (HTML, JSON-LD, XML), colisões de rota, limites de redirect, `indexavel` ligado e desligado, determinismo de `edgeFiles`.
