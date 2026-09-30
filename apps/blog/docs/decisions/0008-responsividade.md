# 0008 – Mobile first, dois breakpoints, cards por container query

- Status: aceito
- Data: 2026-09-30

- CSS base da tela estreita; `40rem` (2 colunas, navegação em linha) e `64rem` (3 colunas no `revista`, sumário lateral). Valores documentados em `src/styles/layout.css`, porque variável CSS não funciona em `@media`.
- Largura máxima `72rem`; coluna de leitura `68ch`.
- Cards em `@container`: a variante `horizontal` só põe a imagem ao lado com ≥ 32rem de container.
- `clamp()` só nos títulos, sobre os tamanhos do tema.
- Axe e paridade rodam em 375 e 1280 px.
