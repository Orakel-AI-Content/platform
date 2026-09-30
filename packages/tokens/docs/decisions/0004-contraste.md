# 0004 – Contraste: pares fixos no gerador

- Status: aceito
- Data: 2026-09-29

## Decisão

Fórmula de luminância relativa da WCAG 2.x, sem arredondar a razão. Pares iguais para todos os temas, em `src/contrast.ts`:

| Primeiro plano / fundo                                                                    | Mínimo | WCAG           |
| ----------------------------------------------------------------------------------------- | ------ | -------------- |
| `color.text`, `color.text-muted`, `color.link` sobre `color.background` e `color.surface` | 4,5:1  | 1.4.3          |
| `color.on-accent` sobre `color.accent`                                                    | 4,5:1  | 1.4.3          |
| `color.focus` sobre `color.background` e `color.surface`                                  | 3:1    | 1.4.11, 2.4.13 |
| `color.border` sobre `color.background`                                                   | 3:1    | 1.4.11         |

- 4,5:1 para todo texto, sem a exceção de texto grande.
- Cores dos pares não podem ter transparência.
- Links no texto corrido são sublinhados (regra dos componentes); por isso não há par link / texto.
- A falha mostra tema, par, as duas cores e a razão obtida.

## Alternativas consideradas

Pares declarados por tema (um tema poderia esquecer um par); pares fixos mais extras por tema (sem necessidade agora).
