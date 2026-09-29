# content-model

Contrato de conteúdo e configuração de site: schemas Zod versionados, recursos suportados
e validação semântica, usados pelo backoffice (quem envia) e pelo content-client, blog e
build (quem consome). Stack: TypeScript + Zod 4, fonte TS sem build. Parte do monorepo —
regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Testar: `pnpm test` (um arquivo: `pnpm vitest run <caminho>`)
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Da raiz: `pnpm turbo run lint typecheck test --filter=@orakel/content-model`
- Container limpo (da raiz): `docker buildx bake content-model-test`

## Regras invioláveis

- Cada versão mora em `src/v<n>/` e é importada por `@orakel/content-model/v<n>`. Dentro
  de uma versão, só mudanças aditivas; incompatível cria a próxima versão (ADR 0002).
- Chave desconhecida é descartada, nunca é erro: nada de `z.strictObject` em schema de leitura.
- Estrutura em inglês, valores escolhidos na configuração em português (ADR 0004).
- Validação semântica devolve `Result` com `Issue[]`; nunca lança por erro de conteúdo.
- Mudou um schema? Atualize as fixtures (`fixtures/v<n>/`) no mesmo PR e rode os testes
  de quem consome (`content-client`, `backoffice`, `blog`).
- Mantenha a cobertura em 90% de linhas e branches.

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – papel, conteúdo da v1, regras do contrato
- `docs/architecture/code-design.md` – camadas, schema × semântica, anti-padrões
- `docs/architecture/folder-structure.md` – onde criar; como acrescentar bloco, preset, regra ou versão
- `docs/conventions/testing.md` – o que testar, fixtures
- `docs/decisions/` – por que as escolhas foram feitas
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
