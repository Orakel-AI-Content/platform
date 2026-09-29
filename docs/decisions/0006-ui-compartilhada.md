# 0006 – UI compartilhada e acessibilidade

- Status: aceito
- Data: 2026-09-29

## Contexto

Todos os sites saem do mesmo código; o que muda entre eles é tema e configuração. Os
sites precisam ser leves (orçamento de JS no CI) e acessíveis.

## Decisão

- Três camadas: `@orakel/tokens` (JSON por tema → variáveis CSS) →
  `@orakel/elements` (Web Components) → `@orakel/ui` (ilhas React, só quando CSS e Web
  Component não resolvem).
- CSS Modules com as variáveis dos tokens; sem CSS-in-JS com runtime; sem APIs
  exclusivas de framework em `ui`.
- Um tema por site, pela configuração do site.
- Meta de acessibilidade **WCAG 2.2 AA**. A entrada diz "AA"; 2.2 é a versão atual, com
  a mesma fórmula de contraste. O build de `tokens` falha abaixo de AA; axe roda no CI.
- Um idioma e um fuso por site, pela configuração; sem biblioteca de i18n na raiz.

## Alternativas consideradas

- Biblioteca de componentes pronta — conflitaria com o orçamento de JS e com temas por
  site.

## Consequências

- Modo escuro, referência visual, layout e ícones são decididos nas unidades de UI.
