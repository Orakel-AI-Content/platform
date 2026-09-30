# Estrutura de pastas do elements

```
src/
├── index.ts          ".": classes, define, ELEMENT_TAGS (sem registrar)
├── base.ts  define.ts  motion.ts
├── carousel.ts  menu.ts  copy-link.ts  share.ts   (+ *.test.ts)
├── register/         um arquivo por elemento: define('ok-…', Classe)
└── test-dom.ts       mount, flush, setScroll (happy-dom)
```

**Elemento novo:** `src/<nome>.ts` (classe + `HTMLElementTagNameMap`), `src/register/<nome>.ts`, subcaminho em `exports`, entrada em `ELEMENT_TAGS`, teste em happy-dom, contrato no ADR 0003 e, no blog, o componente `.astro` com o HTML do degrau 1, o `<script>` do subcaminho e um caso no `e2e/interactions.spec.ts`.
