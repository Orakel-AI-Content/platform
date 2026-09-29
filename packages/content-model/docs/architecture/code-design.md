# Design de código do content-model

Consulte ao escrever ou revisar código em `src/`. Convenções gerais (nomes, erros,
TypeScript): `docs/conventions/coding.md` da raiz.

## Camadas dentro de uma versão

| Camada              | Responsabilidade                                                                 | Pode importar                    |
| ------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| `common.ts`         | Primitivos (ID, slug, host, href, caminho, data, idioma, fuso)                   | `zod`                            |
| `blocks/`           | Um schema por tipo de bloco; `BlockSchema` os une                                | `common`                         |
| `entities/`         | Um schema por entidade do snapshot                                               | `common`, `blocks`               |
| `snapshot.ts`       | Envelope das linhas NDJSON e `parseSnapshotLine`                                 | `entities`, `result`             |
| `resources.ts`      | `ResourcesSchema` e `RESOURCES` da versão                                        | `version`                        |
| `semantic/rules/`   | Uma regra por arquivo, função pura que devolve `Issue[]`                         | tipos de `entities` e `snapshot` |
| `semantic/index.ts` | Compõe as regras em `validateSnapshot`, `validateContent` e `validateSiteConfig` | `rules`, `resources`             |

A direção é única: `common → blocks → entities → snapshot → semantic`. Nada em
`src/v1/` importa de outra versão, e `src/index.ts` não importa nenhuma versão.

## Padrões

- **Schema:** `PascalCase` com sufixo `Schema`; o tipo sai de `z.infer` com o mesmo nome
  sem o sufixo (`ContentSchema` → `Content`). Objetos com `z.object` (descarta chaves
  desconhecidas); nunca `z.strictObject` num schema de leitura.
- **O schema recusa o que nunca é válido** (slug fora do formato, alt ausente, status
  410). **A semântica recusa o que depende de contexto** (referência inexistente, preset
  que a release não conhece, slug repetido).
- **Regra semântica:** `check<Algo>(subject, …, basePath = [])` devolve `Issue[]` com
  `code: 'semantic.<regra>'` e `path` completo. Nunca lança por erro de conteúdo.
- **Erro de quem chama lança:** ex.: passar recursos de outra versão para a v1.
- **Mensagens** em português, para aparecer na tela de revisão do backoffice.

## Anti-padrões

- `if (siteId === …)`: diferença entre sites é campo da configuração.
- Enum no schema para valores que dependem da release (preset, variante, formato de
  imagem): uma release antiga falharia no parse em vez de a semântica apontar o problema.
- Importar de `@orakel/content-model/src/…` ou de um app.

## Exemplo

O caminho completo está nos testes: `src/v1/test-builders.ts` monta um snapshot válido,
`src/v1/semantic/semantic.test.ts` quebra uma regra de cada vez e `src/fixtures.test.ts`
valida as fixtures reais.
