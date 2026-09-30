# tokens

Temas dos sites: `themes/<id>/theme.tokens.json` (DTCG) → `dist/` com CSS por tema,
`themeCss(id)`/`themeFonts(id)` e fontes com hash. O build verifica o conjunto fixo de
tokens e o contraste WCAG AA. Gerador próprio em TypeScript, rodado pelo Node 24. Parte do
monorepo — regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Build (com as verificações): `pnpm build`
- Testar: `pnpm test` (um arquivo: `pnpm vitest run <caminho>`)
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Fontes dos temas (à mão, resultado commitado): `pnpm fonts`
- Container limpo (da raiz): `docker buildx bake tokens-test`

## Regras invioláveis

- Nunca baixe um mínimo de contraste nem tire um par de `PAIRS` para um tema passar: ajuste as cores do tema.
- Todo tema tem exatamente o conjunto de `SEMANTIC_TOKENS`; token novo entra para todos os temas no mesmo PR.
- Só semânticos viram variável; primitivos ficam em `palette`. Não edite `dist/`: é gerado.
- Sem dependência de runtime: `dist/index.js` não importa nada.

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – fluxo tema → `dist/` → blog
- `docs/architecture/folder-structure.md` – tema novo, token novo, tipo novo
- `docs/decisions/0004-contraste.md` – pares e mínimos
- `docs/conventions/testing.md` – o que cada teste cobre
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
