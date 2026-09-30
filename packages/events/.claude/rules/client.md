---
paths:
  - 'src/v*/client/**'
---

# Script do navegador

- Nunca importe `zod`, nem `payload`, `manifest` ou `layout` em runtime: só `import type`. Valores só de `version`, `routes` e `session`.
- Lógica em `tracker.ts`, com tudo do navegador por parâmetro; `index.ts` só liga a `window`, `sessionStorage`, `fetch` e `crypto`.
- Falha de envio ou de armazenamento nunca lança nem quebra a página.
- Peso abaixo de 2 kB com gzip; meça com esbuild depois de mudar (`docs/conventions/testing.md`).
- Tipos do DOM só aqui (`tsconfig.json` desta pasta).
  Detalhes: `docs/decisions/0004-script-do-navegador.md`
