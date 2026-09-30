---
paths:
  - 'themes/**'
---

# Temas

- DTCG 2025.10: cor como `{ "colorSpace": "srgb", "components": [r, g, b], "hex": "#rrggbb" }` (componentes de 0 a 1; `hex` precisa bater).
- Semânticos só por alias à `palette` (`"{palette.blue.700}"`); nada de token fora do conjunto fixo.
- Depois de mudar uma cor, rode `pnpm build`: contraste abaixo do mínimo se corrige no tema, nunca no gerador.
- Fonte nova: `scripts/subset-fonts.ts` + `pnpm fonts`, com a licença ao lado; declare em `fontFaces` (só a do texto com `preload`).
  Detalhes: `docs/decisions/0004-contraste.md`, `docs/decisions/0006-fontes.md`
