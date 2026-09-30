# 0009 – Degrau 1 agora; ícones do Lucide

- Status: aceito
- Data: 2026-09-30

## Decisão

- Menu mobile em `<details>`; carrossel com `scroll-snap`, focável; FAQ em `<details>`. Nenhum JavaScript de UI no app.
- Degrau 2 (botões do carrossel como `<ok-carousel>`, menu com script, copiar link) vem com `packages/elements`, logo depois do blog, envolvendo o HTML atual.
- Ícones: SVGs do Lucide (`lucide-static` 1.49.0, ISC) copiados em `src/components/icons/paths.ts`, sempre `aria-hidden` com texto ao lado.
