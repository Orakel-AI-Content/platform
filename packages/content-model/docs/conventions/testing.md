# Testes do content-model

Complementa `docs/conventions/testing.md` da raiz só com o que é deste pacote.

## O que testar

| Alvo                 | Como                                                                             | Arquivo                           |
| -------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| Cada schema          | Aceita o válido, recusa o inválido, descarta chave desconhecida                  | `*.test.ts` ao lado de cada pasta |
| Cada regra semântica | Parte de um snapshot válido e quebra uma coisa por caso; confere `code` e `path` | `semantic/semantic.test.ts`       |
| Fixtures             | Toda linha de toda fixture passa no schema e na semântica                        | `src/fixtures.test.ts`            |
| Versões              | `SUPPORTED_SCHEMA_VERSIONS` inclui a versão de cada subcaminho                   | `src/index.test.ts`               |

- Dados válidos saem de `src/v1/test-builders.ts`; mude só o campo que o caso verifica.
- Confira `path` nas regras: é o que o backoffice mostra ao revisor.
- Meta: 90% de linhas e branches (`withCoverageThreshold(90)`).

## Fixtures

- Uma por site de exemplo em `fixtures/v<n>/`, com identidades diferentes (tema,
  variante do card, taxonomias).
- Cobrem todos os tipos de bloco e um `n` removido (o artigo 1 do `exemplo-a` pula o 4).
- Mudou o schema? Atualize as fixtures no mesmo PR; o teste aponta a linha e o campo.

## Como rodar

- Nesta pasta: `pnpm test` · um arquivo: `pnpm vitest run src/v1/snapshot.test.ts`
- Da raiz: `pnpm turbo run test --filter=@orakel/content-model`
- Em container limpo: `docker buildx bake content-model-test` (da raiz)
