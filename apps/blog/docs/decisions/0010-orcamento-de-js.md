# 0010 – Orçamento de JS por tipo de página; busca com 130 kB

- Status: aceito
- Data: 2026-09-30

## Contexto

A entrada fixa artigo ≤ 15, home e categoria ≤ 20 e busca ≤ 80 kB gzip, incluindo o JS/WASM do Pagefind. Medido na fase 0 com o Pagefind 1.5.2: `wasm.pt-br.pagefind` 72,2 kB (já comprimido), `pagefind-ui.js` 30,0, `pagefind.js` + worker 24,8, nossos ~1 kB — 125,5 kB. Nem a UI modular (~101 kB) cabe em 80.

## Decisão

- `JS_BUDGET_KB` (`src/checks/js-budget.ts`): artigo, página, institucional e 404 ≤ 15; home, categoria, tag, série e autor ≤ 20; busca ≤ **130**, com o WASM contado.
- Mede por `data-page-type`: scripts externos (seguindo imports entre chunks e `modulepreload`) e inline; JSON-LD fora; na busca, a API, o worker e o WASM do idioma do Pagefind. Scripts de terceiros (GA4) carregam depois do `load` e ficam fora.
- Estouro, página sem tipo ou script ausente: falha permanente.

## Consequências

Revisar a ADR-012 e o `12.0` no workspace com esta medição. Uma atualização do Pagefind que engorde o bundle em mais de ~4,5 kB quebra o build.
