# 0005 – Testes em happy-dom e no navegador do blog; integração no mesmo PR

- Status: aceito
- Data: 2026-09-30

- **Pacote:** Vitest com ambiente happy-dom. O happy-dom não calcula layout: as medidas da trilha do carrossel são fixadas no teste (`setScroll`) e `scrollBy` é simulado.
- **Blog:** `e2e/interactions.spec.ts` (Playwright, roda com o `test:a11y`) testa o menu (Esc, foco, clique fora), o copiar link (clipboard real), o compartilhar (aparece só com a API) e a página sem JavaScript (degrau 1 intacto). O axe passa a ver os elementos ligados.
- **Integração:** `Carousel.astro`, `Header.astro` e o novo `ShareLinks.astro` (nos dois presets de artigo) entraram no mesmo PR do pacote. O artigo foi de ~1,5 para ~2,0 kB de JS.

## Pendência

Nenhuma página dos sites de exemplo tem carrossel (a home `revista` exige 4+ artigos; a fixture `exemplo-b` tem 1): o carrossel só tem teste em happy-dom até uma fixture com mais artigos.
