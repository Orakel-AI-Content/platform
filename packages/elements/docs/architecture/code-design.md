# Design de código do elements

- Elemento novo estende `OkElement` e implementa `setup(signal)`: busca as partes por `data-ok-*`, sai sem fazer nada se faltar alguma, liga os listeners com `{ signal }`.
- Nunca crie conteúdo que o leitor precise; nunca troque o HTML do servidor por outro. Botão que só funciona com JS vem `hidden` do servidor e o elemento o mostra.
- Textos visíveis e anunciados vêm do HTML (`data-*`), no idioma do site.
- Acessibilidade: controle nativo (`button`, `details`), foco previsível, `aria-live` para resultados, `prefers-reduced-motion` respeitado, nada automático sem controle do leitor.
- Sem dependências; tamanho de cada elemento na casa das centenas de bytes.

Anti-padrões: shadow DOM; `innerHTML` com conteúdo; estilo no JS; listener sem `signal`; `document.querySelector` fora do próprio elemento (exceto o listener de clique fora do `ok-menu`).
