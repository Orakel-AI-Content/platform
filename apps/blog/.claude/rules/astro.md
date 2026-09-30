---
paths:
  - 'src/**/*.astro'
---

# Componentes Astro

- Confira a API na versão instalada (`node_modules/astro`, 7.3.x) antes de usar algo novo.
- Estilo em `<style>` com escopo e `var(--…)` do tema; nada de cor, fonte ou espaçamento fixos.
- Breakpoints só `40rem` e `64rem` (`src/styles/layout.css`); componente que muda com o espaço usa `@container`.
- Toda imagem pelo `Image.astro` (alt obrigatório ou `""` se decorativa); ícone pelo `Icon.astro`, com texto ao lado.
- Link interno: `sitePath(ctx.base, rota do core)`. Script: só o de eventos e os do Pagefind; o resto é do `elements`.
  Detalhes: `docs/architecture/code-design.md`
