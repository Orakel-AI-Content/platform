---
paths:
  - 'src/app/**'
  - 'src/components/**'
  - 'src/proxy.ts'
  - 'next.config.ts'
---

# Next.js (App Router)

- Next 16 mudou APIs (ex.: `middleware.ts` virou `proxy.ts`). Antes de usar uma API do Next, leia o guia da versão instalada em `node_modules/next/dist/docs/`.
- Telas e rotas são finas: leem request/env, chamam o domínio, traduzem `Result` (`problem()` nas rotas).
- A área `(admin)` confere o Access no layout, mas cada página e rota confere de novo pelo domínio.
- Componentes: shadcn/ui em `src/components/ui/`, só com os tokens de `globals.css`; TanStack Table 9 (`useTable`).
- Acessibilidade WCAG 2.2 AA: rótulos, foco visível, contraste; o E2E roda o axe.
  Detalhes: `docs/design/design-system.md`, `docs/architecture/code-design.md`
