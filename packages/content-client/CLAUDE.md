# content-client

Cliente da API de exportação do Backoffice: lê o snapshot NDJSON em streaming, valida pelo
`@orakel/content-model/v1` e alimenta o Content Layer do Astro (loaders por coleção).
Stack: TypeScript + `fetch` nativo; Astro 7 só no subcaminho `/astro`. Parte do monorepo —
regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Testar: `pnpm test` (um arquivo: `pnpm vitest run <caminho>`)
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Container limpo (da raiz): `docker buildx bake content-client-test`

## Regras invioláveis

- Uma leitura do snapshot por build, compartilhada pelos loaders; o `metaFile` leva o header e o end ao render.
- Valide só pelo `content-model` da versão (`parseSnapshotLine`, `validateSnapshot`); campo desconhecido é descartado, nunca erro.
- Falha é `Result`; a classificação transitória × permanente fica em `failures.ts` (o render depende dela).
- Astro só em `src/v*/astro/`. O pacote não lê env nem loga o token.

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – leitura, falhas, loaders
- `docs/architecture/folder-structure.md` – coleção nova, versão nova, leitura ao vivo
- `docs/conventions/testing.md` – servidor de teste e casos
- `docs/decisions/` – por que as escolhas foram feitas
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
