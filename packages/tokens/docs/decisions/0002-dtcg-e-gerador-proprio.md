# 0002 – Temas em DTCG, com gerador próprio

- Status: aceito
- Data: 2026-09-29

## Decisão

- Cada tema é `themes/<id>/theme.tokens.json` no formato DTCG (Design Tokens Format Module 2025.10), num subconjunto: `color` (objeto `srgb` com `components` e `hex` opcional, conferido), `dimension` (`px`, `rem`), `fontFamily`, `number`, `shadow`. `$type` herdado do grupo; aliases `{caminho}` no valor inteiro ou nos campos da sombra.
- O que é da plataforma e não do DTCG fica em `$extensions["ai.orakel.theme"]`: `colorScheme` e `fontFaces`.
- O gerador é código próprio (`src/`), rodado direto pelo Node 24: flatten → aliases → valores (Zod) → conjunto fixo → contraste → CSS. Todos os erros de todos os temas saem juntos; com qualquer erro, `dist/` não é tocado.

## Alternativas consideradas

- Style Dictionary 5: pipeline pronto, mas as três verificações da plataforma (contraste, conjunto fixo, tema do site) virariam plugins, e o resto do pipeline não seria usado.
- JSON próprio: mais curto de escrever, sem interoperar com ferramentas de design.

## Consequências

Nenhuma dependência de runtime; `zod` só em devDependencies. Ferramentas de design que exportam DTCG servem de ponto de partida para um tema novo.
