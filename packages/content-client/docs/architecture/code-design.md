# Design de código do content-client

- `src/index.ts` e `src/failures.ts`: sem dependência de versão.
- `src/v1/`: leitura da API v1 com `@orakel/content-model/v1`; nada de Astro.
- `src/v1/astro/`: único lugar com Astro (exceção da raiz no ESLint da unidade).
- Tudo que vem de fora chega por parâmetro (URL, site, token, `fetch`); o pacote não lê
  variáveis de ambiente nem loga o token.
- Erro esperado é `Result`; os loaders convertem em `SnapshotReadError` só na fronteira com o Astro.

Anti-padrões: ler o snapshot duas vezes no mesmo build; validar com outro schema que não o
`content-model`; importar Astro fora de `src/v1/astro/`.
