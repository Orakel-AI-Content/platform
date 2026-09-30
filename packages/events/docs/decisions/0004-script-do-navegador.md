# 0004 – O script do navegador fica no events, sem dependências

- Status: aceito
- Data: 2026-09-29

## Contexto

O script de eventos roda nas páginas do blog, mas monta o payload deste pacote e aplica
as regras de sessão deste contrato. Ele tem orçamento de 1 a 2 kB dentro do JS da página.

## Decisão

- Subcaminho `@orakel/events/v1/client`, sem dependência de runtime.
- `createPageviewTracker({ storage, send, now, uuid })` concentra a lógica e é testado
  em Node com dublês. `startPageviewTracking(page)` liga essa função a `window`,
  `sessionStorage`, `fetch` e `crypto`, e ao `pageshow` do bfcache.
- O `client/` só importa tipos do resto da versão e constantes sem Zod (`version.ts`,
  `routes.ts`, `session.ts`). O ESLint da unidade impede o `zod` e imports de runtime de
  `payload`, `manifest` e `layout` ali. `sideEffects: false` deixa o bundler descartar o
  que não é usado.
- Tipos do DOM só em `src/v1/client/tsconfig.json`; o resto do pacote não os enxerga.
- Medido na geração: 1.248 B minificado, **741 B com gzip**.

## Alternativas consideradas

- No blog: regras de sessão longe do contrato.
- Web Component em `packages/elements`: não é comportamento de interface.

## Consequências

O blog importa `startPageviewTracking` e passa a página (`{ articleId }` ou
`{ pageType, path }`); o verificador de orçamento de JS do blog confere o peso.
