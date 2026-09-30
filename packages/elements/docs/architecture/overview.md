# Visão geral do elements

Consulte antes de criar ou mudar um Web Component.

```mermaid
flowchart LR
  S[HTML do servidor<br/>degrau 1: details, scroll-snap, campo] --> E[ok-* conecta<br/>espera os filhos]
  E --> B[setup: mostra botões hidden,<br/>liga eventos com o signal]
  B --> U[degrau 2]
  X[sem JS ou parte faltando] --> S
```

- Só comportamento sobre o HTML do servidor, em light DOM (ADR 0002). Estilo e textos são do blog.
- Quatro elementos: `ok-carousel`, `ok-menu`, `ok-copy-link`, `ok-share` (ADR 0003).
- Cada elemento é registrado pelo seu subcaminho, importado pelo componente `.astro` que o usa (ADR 0004).
- Tudo conta no orçamento de JS do blog (artigo ≤ 15 kB).
