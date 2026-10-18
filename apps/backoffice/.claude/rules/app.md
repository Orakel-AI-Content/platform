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
- Interface: o Ecme (`Orakel-AI-Content/design-reference`) é a referência de design e de código. Porte a peça equivalente do template pelas regras de `docs/migration/ecme.md` (`'use client'`, `next/link`, `usePathname`, tema em cookie, só tokens do `@theme`); TanStack Table 9 (`useTable`). Toda tela, nova ou alterada, segue `docs/design/design-system.md`.
- Acessibilidade WCAG 2.2 AA: rótulos, foco visível, contraste; o E2E roda o axe.
  Detalhes: `docs/migration/ecme.md`, `docs/design/design-system.md`, `docs/architecture/code-design.md`
