# events

Contrato dos eventos: payload, manifesto, layout posicional do Analytics Engine, regras
de sessão e script do navegador, por versão do formato. O Worker de borda grava, o
agregador lê, o blog envia. Stack: TypeScript + Zod 4 (só no servidor), fonte TS sem
build. Parte do monorepo — regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Testar: `pnpm test` (um arquivo: `pnpm vitest run <caminho>`)
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Da raiz: `pnpm turbo run lint typecheck test --filter=@orakel/events`
- Container limpo (da raiz): `docker buildx bake events-test`

## Regras invioláveis

- Cada versão mora em `src/v<n>/`, importada por `@orakel/events/v<n>`; dentro dela, só
  mudanças aditivas. Posição do layout nunca é reordenada nem reaproveitada (ADR 0002).
- Nada de IP, URL completa do referrer ou identificador persistente no payload ou no layout.
- `src/v1/client/` nunca carrega o Zod nem código de runtime do servidor; o script fica
  abaixo de 2 kB com gzip (ADR 0004).
- `blobN` só aparece em `src/v1/layout.ts`.
- Mudou o formato? Rode também os testes do `blog-worker` e do agregador quando existirem.
- Mantenha a cobertura em 90% de linhas e branches.

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – papel, consumidores, regras do contrato
- `docs/architecture/code-design.md` – módulos com e sem Zod, padrões
- `docs/architecture/folder-structure.md` – como acrescentar campo, evento, motivo ou versão
- `docs/conventions/testing.md` – o que testar, peso do script
- `docs/decisions/` – por que as escolhas foram feitas
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
