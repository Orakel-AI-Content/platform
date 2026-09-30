# 0003 – Entrega: arquivos por tema e CSS embutido; tema inexistente é falha permanente

- Status: aceito
- Data: 2026-09-29

## Decisão

- `dist/themes/<id>.css` (exportado como `@orakel/tokens/themes/<id>.css`), para elements, ui e páginas de teste.
- `dist/index.js` + `index.d.ts` com `THEME_IDS`, `isThemeId`, `themeCss(id)` e `themeFonts(id)`; o CSS vai embutido no módulo, sem leitura de arquivo em runtime.
- O blog chama `themeCss(config.theme)` e injeta o resultado num `<style>` no `<head>`: o mesmo código no build estático e no SSR multi-site (paridade), sem requisição que bloqueie a renderização. Custo: 2–3 kB por HTML, antes da compressão.
- Tema inexistente: `themeCss` devolve `undefined`; o blog falha com **código 10** (permanente), citando o tema e os `THEME_IDS` da release. O backoffice oferece um seletor com os `THEME_IDS`. O `content-model` continua com o slug, sem depender do tokens.

## Alternativas consideradas

- Só `<link>` para o arquivo: fica em cache, mas bloqueia a renderização e exige uma rota por tema no SSR.
- Validar no `content-model`: erro na hora de salvar, mas o contrato mudaria a cada tema.
