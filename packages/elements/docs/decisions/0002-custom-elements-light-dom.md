# 0002 – Custom elements puros, em light DOM, só com comportamento

- Status: aceito
- Data: 2026-09-30

## Decisão

- Sem biblioteca: `class extends OkElement` (base de ~30 linhas). O Lit custaria ~5 kB por página, um terço da folga do artigo, para componentes que não renderizam template.
- **Light DOM:** o elemento envolve o HTML do degrau 1 que o servidor mandou e só acrescenta comportamento — mostra botões que vêm `hidden`, liga eventos, põe `disabled` e `aria-controls`. Não cria conteúdo; estilo (escopo do Astro, variáveis do tema) e textos (idioma do site) ficam no blog.
- **Ciclo de vida:** `connectedCallback` espera os filhos existirem (fim do parse ou o microtask seguinte) e chama `setup(signal)`; todos os listeners usam o `signal`, abortado no `disconnectedCallback`.
- **Parte do HTML faltando:** o elemento não faz nada e o degrau 1 continua.
- `define()` ignora tag já registrada e ambiente sem `customElements`.

## Alternativas consideradas

Lit; shadow DOM com `::part`; Declarative Shadow DOM (duplicaria a marcação e complicaria a paridade estático × SSR); scripts soltos sem custom elements.
