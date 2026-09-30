# Design de código do events

Consulte ao escrever ou revisar código em `src/`. Convenções gerais: `docs/conventions/coding.md` da raiz.

## Módulos de uma versão

| Módulo        | Responsabilidade                                                    | Carrega Zod? |
| ------------- | ------------------------------------------------------------------- | ------------ |
| `version.ts`  | `FORMAT_VERSION`                                                    | Não          |
| `routes.ts`   | `/_e/`, `/_e/pageview`, caminho do manifesto                        | Não          |
| `session.ts`  | Regiões sem sessão, `canIssueSession`, 30 min de inatividade        | Não          |
| `layout.ts`   | Posições, `pageviewDataPoint`, `discardDataPoint`, `COLUMNS`        | Não          |
| `payload.ts`  | Schemas do payload, `parseEventBody`, limite do corpo               | Sim          |
| `manifest.ts` | Schema do manifesto, build, parse e índice                          | Sim          |
| `client/`     | Script do navegador: `tracker.ts` (lógica) e `index.ts` (navegador) | Nunca        |

O `client/` só importa tipos dos módulos com Zod e valores dos módulos sem Zod. Nada em
`src/v1/` importa de outra versão; `src/index.ts` não importa nenhuma versão.

## Padrões

- **Parse** devolve `Result` com `Issue[]`; nunca lança por entrada inválida. Os códigos
  (`size`, `json`, `schema.*`) são a interface com o Worker para o motivo do descarte.
- **Lógica do navegador por injeção:** o que vem do navegador (`storage`, `send`, `now`,
  `uuid`) chega por parâmetro; `index.ts` só liga.
- **Falha de medição nunca quebra a página:** envio que falha perde o evento;
  armazenamento que lança segue sem sessão.
- **Valores gravados em inglês** (`pageview`, `discard`, `mobile`), como estrutura.

## Anti-padrões

- Importar `zod` ou `payload.ts` em runtime dentro de `client/`.
- Gravar a URL do referrer, o IP ou qualquer identificador persistente.
- Escrever `blobN` fora de `layout.ts`.
