# Design de código do blog

- **Lógica em TS, apresentação em Astro.** `src/data`, `src/routing`, `src/render`, `src/measurement`, `src/checks` e `src/integrations` são TypeScript puro e testado com Vitest; `.astro` só compõe.
- **Nada de domínio no app.** SEO, rotas e arquivos gerados são do core; tema do tokens; formato de eventos do events. Faltou algo? Vai para o pacote.
- **Configuração do site é dado.** Nenhum `import.meta.env` decide tema, preset ou variante; `BLOG_OUTPUT` decide só a saída.
- **Links sempre por `sitePath(base, caminho)`,** com caminhos das rotas do core — é o que faz a visualização funcionar com o prefixo `/<site>`.
- **Estilo com escopo** + variáveis do tema; componentes que mudam com o espaço usam `@container`.
- **Erros esperados** viram `BuildError` com `kind`; tema ou preset desconhecido é `permanent`.

Anti-padrões: `if (siteId === …)`; caminho montado com template string; `fetch` direto nas páginas; JavaScript de UI no app (é do `elements`); React.
