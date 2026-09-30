# 0003 – Os quatro componentes e o contrato com o HTML

- Status: aceito
- Data: 2026-09-30

Prefixo `ok-`; atributos `data-ok-*`; eventos `ok-*`.

| Elemento         | HTML esperado                                                                                                                            | Comportamento                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ok-carousel>`  | `[data-ok-track]` (com `id`), `button[data-ok-prev]`, `button[data-ok-next]` com `hidden`                                                | Mostra os botões com `aria-controls`; rola um item (largura do primeiro + `column-gap`); `disabled` nas pontas; `smooth` só sem `prefers-reduced-motion`; sem autoplay (WCAG 2.2.2) |
| `<ok-menu>`      | Um `<details>` com `<summary>`                                                                                                           | Esc fecha e devolve o foco ao `<summary>`; clique fora fecha                                                                                                                        |
| `<ok-copy-link>` | `input[data-ok-url]`, `button[data-ok-copy]` com `hidden`, `[data-ok-status]` (`role="status"`); textos em `data-copied` e `data-failed` | Copia com `navigator.clipboard`, anuncia e emite `ok-copy` (`{ url }`); sem clipboard ou com erro, foca e seleciona o campo                                                         |
| `<ok-share>`     | `button[data-ok-share]` com `hidden`; `data-title`, `data-url`                                                                           | Só com `navigator.share` (e `canShare`); cancelar não é erro                                                                                                                        |
