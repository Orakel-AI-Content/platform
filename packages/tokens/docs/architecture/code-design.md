# Design de código do tokens

| Arquivo           | Papel                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/schema.ts`   | Tipos DTCG suportados (Zod), extensão do tema, `SEMANTIC_TOKENS`, `Issue`/`Result`                                 |
| `src/resolve.ts`  | Documento → tokens planos, `$type` herdado, aliases, validação por tipo                                            |
| `src/contrast.ts` | Luminância, razão e `PAIRS` fixos                                                                                  |
| `src/css.ts`      | Valor de cada tipo em CSS; `renderThemeCss`                                                                        |
| `src/fonts.ts`    | Nome com hash e URL pública das fontes                                                                             |
| `src/build.ts`    | `buildTheme` (um tema, sem disco), `buildThemes` (pastas → `dist/`), `renderIndex` e a entrada `node src/build.ts` |

- Erro esperado é `Issue` agregado, nunca exceção; só `build.ts` imprime e define o código de saída.
- `buildTheme` recebe o documento e uma função de leitura de fonte: os testes não dependem do disco, exceto os do build de ponta a ponta.
- A saída é determinística: temas e variáveis em ordem, hash pelo conteúdo.

Anti-padrões: variável CSS escrita à mão fora do gerador; cor crua (primitivo) usada por componente; tema com token a mais "só para este site" — token novo entra no conjunto fixo para todos.
