# 0002 – Duas saídas do mesmo app: estático e visualização

- Status: aceito
- Data: 2026-09-30

## Decisão

- `BLOG_OUTPUT` (lido só no `astro.config.ts`) escolhe a saída: `static` (padrão, `dist/`, um site por `SITE_ID`) ou `preview` (`output: 'server'` com `@astrojs/node` standalone, `dist-preview/`).
- O valor chega às páginas por `import.meta.env.BLOG_OUTPUT` (Vite `define`) e decide só o que é da saída: coleções, middleware, script de eventos, busca. Tema e layout vêm sempre da configuração do site.
- A integração do fim do build (ADR 0005) só roda no estático.

## Consequências

Um só código de páginas para os dois modos, o que sustenta a paridade (ADR 0012).
