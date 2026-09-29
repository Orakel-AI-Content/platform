---
paths:
  - 'fixtures/**'
---

# Fixtures NDJSON

- Uma linha por JSON: `header` primeiro, `{ "type", "data" }` por entidade, `end` por último com as contagens certas.
- Precisam passar no schema e na validação semântica da versão (`src/fixtures.test.ts`).
- São consumidas pelo blog (sites de exemplo), pelo `content-client` e pelo teste de contrato do backoffice: mudança aqui afeta os três.
- Os dois sites mantêm identidades distintas (tema, variante do card, taxonomias) e juntos cobrem todos os tipos de bloco.
- Mídias trazem todas as variantes do perfil de imagem da versão.
  Detalhes: `docs/conventions/testing.md`
