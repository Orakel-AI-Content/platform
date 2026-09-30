---
paths:
  - 'src/**'
  - 'scripts/**'
---

# Entrypoints do site-builder

- `render`/`publish` recebem dependências injetadas; a real fica no `cli.ts`. Teste com as falsas.
- Falha esperada = `ClassifiedError` com `kind`; confira que `result.json`/`publish.json` saem mesmo na falha.
- Nada de segredo em mensagem de erro, log ou arquivo do volume.
- Mudou algo que a imagem usa (caminhos, dependências, blog)? Rode a imagem e a `scripts/smoke.sh` antes do PR.
  Detalhes: `docs/architecture/code-design.md`
