---
paths:
  - 'src/pages/**'
  - 'src/integrations/**'
  - 'src/checks/**'
  - 'src/data/**'
  - 'scripts/**'
---

# Dados e fim do build

- Uma leitura do snapshot por build: páginas e `/orakel-edge.json` usam as coleções; nada relê a API.
- Falha esperada é `BuildError` com `kind` (`permanent` para conteúdo, tema, preset, orçamento; `transient` para rede).
- A saída é idempotente: nada de data do build, aleatório ou ordem instável em arquivo gerado (o `build:examples` compara).
- Mudou o orçamento? `JS_BUDGET_KB` + ADR 0010 + pendência de revisão da ADR-012 no workspace.
  Detalhes: `docs/decisions/0005-fim-do-build.md`
