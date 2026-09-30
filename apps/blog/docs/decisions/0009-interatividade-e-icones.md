# 0009 – Interatividade em dois degraus; ícones do Lucide

- Status: aceito (atualizado com o `@orakel/elements`)
- Data: 2026-09-30

## Decisão

- **Degrau 1 (HTML e CSS, sempre):** menu mobile em `<details>`; carrossel com `scroll-snap`, focável; FAQ em `<details>`; link do artigo num campo selecionável.
- **Degrau 2 (`@orakel/elements`, sobre o mesmo HTML):**
  - `Carousel.astro` → `<ok-carousel>`: botões de anterior e próximo, que vêm `hidden` do servidor;
  - `Header.astro` → `<ok-menu>`: Esc e clique fora fecham o menu;
  - `ShareLinks.astro` (presets de artigo) → `<ok-copy-link>` e `<ok-share>`.
    Cada componente importa só o subcaminho do seu elemento num `<script>`. Sem JS, o degrau 1 continua.
- Nenhum JavaScript de UI escrito no app: comportamento novo vai para o `elements`.
- Ícones: SVGs do Lucide (`lucide-static` 1.49.0, ISC) em `src/components/icons/paths.ts`, sempre `aria-hidden` com texto ao lado.

## Consequências

O carrossel ainda não aparece nos sites de exemplo (home `revista` exige 4+ artigos; a fixture `exemplo-b` tem 1): no navegador real, só menu, copiar link e compartilhar são testados (`e2e/interactions.spec.ts`).
