# 0004 – Um subcaminho por elemento, que o registra

- Status: aceito
- Data: 2026-09-30

- `@orakel/elements` exporta as classes, `define` e `ELEMENT_TAGS`, sem registrar nada.
- `@orakel/elements/carousel`, `/menu`, `/copy-link`, `/share` registram a tag (`src/register/*.ts`). O `sideEffects` do `package.json` lista só esses arquivos.
- No blog, cada componente `.astro` importa o subcaminho do seu elemento num `<script>`: a página só carrega o JS dos componentes que renderiza.
- As classes estendem `HTMLElement`: importe só no navegador.
