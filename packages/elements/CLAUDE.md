# elements

Web Components do degrau 2 (`ok-carousel`, `ok-menu`, `ok-copy-link`, `ok-share`): custom
elements puros, em light DOM, que só acrescentam comportamento ao HTML do servidor. Quem usa
é o `apps/blog`. Parte do monorepo — regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Testar: `pnpm test` (happy-dom; um arquivo: `pnpm vitest run <caminho>`)
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Navegador real: `pnpm --filter @orakel/blog build:examples && pnpm --filter @orakel/blog test:a11y`

## Regras invioláveis

- Sem JS, a página funciona (degrau 1): o elemento nunca cria conteúdo nem troca o HTML do servidor.
- Sem dependências, sem shadow DOM, sem estilo no JS; textos vêm de `data-*` do HTML.
- Todo listener usa o `signal` do `setup`; parte do HTML faltando = não fazer nada.
- Cada elemento pesa no orçamento de JS do blog (artigo ≤ 15 kB).

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/decisions/0003-componentes.md` – contrato de cada elemento com o HTML
- `docs/architecture/folder-structure.md` – elemento novo, passo a passo
- `docs/architecture/code-design.md` – regras e anti-padrões
- `docs/conventions/testing.md` – happy-dom e navegador real
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
