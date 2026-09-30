---
paths:
  - 'src/head.ts'
  - 'src/v*/seo.ts'
  - 'src/v*/json-ld.ts'
---

# Head e JSON-LD

- HTML só em `renderHead`; um `</script>` em qualquer campo não pode fechar o JSON-LD (há teste).
- Nós do JSON-LD sem chaves vazias (`compact`) e ligados por `@id`; dado que o snapshot não tem não é inventado.
- Campo novo na configuração (ex.: logo) entra primeiro no `content-model`.
  Detalhes: `docs/decisions/0004-head-neutro.md`, `docs/decisions/0007-json-ld.md`
