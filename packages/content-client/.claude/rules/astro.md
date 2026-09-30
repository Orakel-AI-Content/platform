---
paths:
  - 'src/v*/astro/**'
---

# Loaders do Astro

- Antes de usar uma API do Astro, confira a da versão instalada (`node_modules/astro`); o Content Layer mudou entre versões.
- Todos os loaders usam a mesma leitura (`readOnce`); nunca leia o snapshot por coleção.
- Sem `schema` do Astro nos loaders: a validação é a do `content-model`.
- Falha vira `SnapshotReadError` com `kind`.
  Detalhes: `docs/decisions/0002-leitura-unica-e-meta-file.md`
