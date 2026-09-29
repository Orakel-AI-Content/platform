---
paths:
  - 'src/v*/**'
---

# Schemas de uma versão

- Dentro de `src/v<n>/`, só mudança aditiva: campo opcional novo ou valor novo em `RESOURCES`. Remover, renomear ou mudar tipo cria `src/v<n+1>/`.
- `z.object` (descarta chave desconhecida); nunca `z.strictObject` em schema de leitura.
- O schema recusa o que nunca é válido; o que depende de contexto (preset da release, referência, slug repetido) vai para `semantic/`.
- Nada de enum para valores que dependem da release (preset, variante, formato de imagem).
- Campos em inglês; valores de configuração em português; `indexavel` é exceção (ADR 0004).
- Nomes: `<Nome>Schema` e `type <Nome> = z.infer<…>`. Nada importa de outra versão nem de `src/index.ts`.
- Tipo de bloco novo: arquivo em `blocks/`, `BlockSchema`, `BLOCK_TYPES` e um exemplo numa fixture.
  Detalhes: `docs/architecture/code-design.md`, `docs/architecture/folder-structure.md`
