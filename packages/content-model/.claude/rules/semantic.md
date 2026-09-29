---
paths:
  - 'src/v*/semantic/**'
---

# Validação semântica

- Uma regra por arquivo em `rules/`: `check<Regra>(subject, …, basePath = [])` devolve `Issue[]`.
- `code: 'semantic.<regra>'` e `path` completo até o campo: é o que o backoffice mostra ao revisor.
- Nunca lance por erro de conteúdo; só por erro de quem chama (ex.: recursos de outra versão).
- Recursos vêm por parâmetro (`Resources` da release do site), nunca direto de `RESOURCES`.
- Mensagens em português, curtas, dizendo o que corrigir.
- Regra nova: chamada em `semantic/index.ts` e um caso que a quebra em `semantic.test.ts`.
  Detalhes: `docs/architecture/code-design.md`
