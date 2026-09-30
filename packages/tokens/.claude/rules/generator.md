---
paths:
  - 'src/**'
---

# Gerador

- Problema esperado vira `Issue` agregado; só `build.ts` imprime e define o código de saída.
- Nada é gravado em `dist/` se houver qualquer problema em qualquer tema.
- Saída determinística: ordem estável de temas e variáveis; hash pelo conteúdo.
- Mudou `SEMANTIC_TOKENS`, `PAIRS` ou a saída? Atualize os temas, os testes e o ADR correspondente no mesmo PR.
  Detalhes: `docs/architecture/code-design.md`
