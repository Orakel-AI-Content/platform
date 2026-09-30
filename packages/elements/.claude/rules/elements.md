---
paths:
  - 'src/**'
---

# Web Components

- Estenda `OkElement`; implemente `setup(signal)`; todo `addEventListener` com `{ signal }`.
- Busque as partes por `data-ok-*` dentro do próprio elemento; faltou alguma, retorne sem mudar nada.
- Mostre só o que vem `hidden` do servidor; não gere conteúdo, não use shadow DOM nem `innerHTML`.
- Mudou o contrato com o HTML? Atualize o ADR 0003 e o componente `.astro` do blog no mesmo PR.
  Detalhes: `docs/architecture/code-design.md`
