# Acessibilidade

Consulte ao criar ou revisar qualquer interface (sites, Backoffice, componentes).

## Meta

**WCAG 2.2 nível AA** em todos os sites e no Backoffice (ADR 0006).

## Como é garantida

| Onde                    | Verificação                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@orakel/tokens`        | Todo par de cor de texto/fundo passa pela fórmula de contraste da WCAG; abaixo de AA (4,5:1 texto normal, 3:1 texto grande e componentes), o build falha |
| `@orakel/content-model` | Bloco de imagem exige texto alternativo ou marcação explícita de decorativa                                                                              |
| CI (`test:a11y`)        | axe com Playwright nos dois sites de exemplo                                                                                                             |
| E2E manual (`e2e.yml`)  | Fluxos completos, incluindo navegação por teclado                                                                                                        |

## Checklist por componente

- Operável só com teclado; ordem de foco lógica; foco sempre visível.
- Rótulo acessível em todo controle; `aria-*` só quando HTML nativo não resolve.
- Alvos de toque com pelo menos 24×24 px (WCAG 2.2, 2.5.8).
- Nada depende só de cor; respeita `prefers-reduced-motion`.
- Idioma do documento vem da configuração do site (`lang`).

Detalhes de tokens, layout e componentes ficam em `docs/design/` das unidades `tokens`,
`elements`, `ui` e `blog`.
