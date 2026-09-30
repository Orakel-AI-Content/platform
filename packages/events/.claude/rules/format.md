---
paths:
  - 'src/v*/**'
---

# Formato dos eventos

- Dentro de `src/v<n>/`, só mudança aditiva: campo opcional no payload, posição nova no fim do layout. O resto cria `src/v<n+1>/`.
- O navegador informa o mínimo: site, horário, país e IP nunca entram no payload.
- Parse devolve `Result` com `Issue[]`; códigos `size`, `json` e `schema.*` são a interface com o Worker.
- Valores gravados em inglês (`pageview`, `discard`, `mobile`).
- Campo ou evento novo: teste no payload, no layout e no tracker (o corpo enviado passa em `parseEventBody`).
  Detalhes: `docs/architecture/code-design.md`, `docs/architecture/folder-structure.md`
