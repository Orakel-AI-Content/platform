# core

SEO técnico e arquivos da borda dos sites: rotas, head e JSON-LD, sitemap, RSS,
`robots.txt`, `_redirects` e `_headers`. Funções puras sobre o snapshot v1 do
`@orakel/content-model`; `"."` neutro, `./v1` por versão do schema. Parte do monorepo —
regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Testar: `pnpm test` (um arquivo: `pnpm vitest run <caminho>`; atualizar snapshots: `-u`)
- Cobertura (meta de 90%): `pnpm vitest run --coverage`
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Container limpo (da raiz): `docker buildx bake core-test`

## Regras invioláveis

- Funções puras: sem disco, rede, env nem hora atual; a mesma entrada gera a mesma saída.
- Caminho de página só por `routes.ts`; slug reservado e redirect sobre página viva são erro, nunca substituição.
- Todo texto em HTML/XML passa por `renderHead`/`escapeXml`; JSON-LD só por `serializeJsonLd`.
- Problema esperado volta como `Issue` (o render trata como falha permanente).

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – fluxo e responsabilidades
- `docs/architecture/folder-structure.md` – rota, arquivo, crawler ou schema novos
- `docs/conventions/testing.md` – fixtures, snapshots, cobertura
- `docs/decisions/` – por que cada arquivo é gerado assim
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
