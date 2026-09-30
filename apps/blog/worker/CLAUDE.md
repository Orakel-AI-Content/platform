# blog-worker

Worker de borda dos sites: único código executado na Cloudflare, só em `/_e/*`. Valida o
pageview, emite a sessão e grava no Analytics Engine. Stack: TypeScript + workerd
(wrangler), sem framework; formato dos eventos em `@orakel/events/v1`. Parte do
monorepo — regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Rodar: `pnpm dev` (`wrangler dev`, com `dev-assets/`)
- Testar: `pnpm test` (um arquivo: `pnpm vitest run <caminho>`)
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Mudou o `wrangler.jsonc`: `pnpm types` e versione o `worker-configuration.d.ts`

## Regras invioláveis

- Nunca leia nem grave o IP; site, país e horário nunca vêm do payload.
- Falha na medição perde o evento, nunca a página: descarte responde sem corpo, exceção
  responde `204`.
- Só `src/index.ts` conhece `Request`, `env` e `Response`; o resto recebe tudo por parâmetro.
- Formato, layout, sessão e manifesto vêm do `@orakel/events`; nada de `blobN` aqui.
  Mudou o contrato? É lá, com os testes de lá.
- Não edite `worker-configuration.d.ts` à mão.

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – papel, regras, bindings
- `docs/architecture/code-design.md` – módulos e o que toca o runtime
- `docs/architecture/folder-structure.md` – como acrescentar regra, evento ou binding
- `docs/conventions/testing.md` – testes em Node e prova no `wrangler dev`
- `docs/decisions/` – por que as escolhas foram feitas
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
