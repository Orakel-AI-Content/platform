# Fronteiras do monorepo

- App nunca importa app; pacote nunca importa app. Código compartilhado vira pacote em `packages/`.
- Importe pacotes pelo nome `@orakel/<nome>` (e subcaminhos do `exports`), nunca por `src/` nem por caminho relativo que saia da unidade.
- Pacotes de domínio não importam React, Astro nem Next. React só em `packages/ui` e nos apps; Astro só em `adapters/astro` e em `@orakel/content-client/astro`; Next só em `apps/backoffice`.
- Nada de fork por site: diferença entre sites é campo de configuração em `@orakel/content-model`, nunca `if (siteId === …)`.
- Mudou um contrato (`content-model`, `events`, API de exportação)? Evolução aditiva dentro da versão; incompatível cria a próxima. Atualize fixtures e rode os testes de quem consome.
- Dependência externa nova: versão no `catalog` de `pnpm-workspace.yaml`, `"catalog:"` na unidade.
  Detalhes: `docs/architecture/overview.md`, `docs/conventions/coding.md`
