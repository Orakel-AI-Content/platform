# Convenções de git

Consulte ao criar branch, commit, PR ou release.

## Branches e PRs

- `main` é a única branch longa; sem proteção enquanto o time tiver uma pessoa.
- Branch de trabalho: `<número-da-issue>-<slug-curto>` (ex.: `42-schema-bloco-faq`).
- PR pequeno e mergeável; **squash merge**. O título do PR vira o commit na `main`.
- O CI (`ci.yml`) precisa estar verde antes do merge.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):
`<tipo>(<escopo opcional>): <descrição no imperativo, minúscula, sem ponto>`.

- Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `perf`.
- Escopo = nome da unidade sem `@orakel/` (ex.: `feat(content-model): adiciona bloco faq`).
- O `pre-commit` (lefthook) formata e corrige lint nos arquivos staged.

## Versões do site-builder

- O Backoffice dispara o `release.yml` (`workflow_dispatch`, input `version` = `X.Y.Z`) na
  `main`; o workflow publica a imagem `site-builder:X.Y.Z` e só depois cria a tag Git
  `site-builder-vX.Y.Z`. Ninguém cria a tag à mão, e push de tag não dispara nada
  (ADR 0018).
- **Major:** muda o schema da API ou exige migração de configuração.
- **Minor:** funcionalidades. **Patch:** correções.
- Merge na `main` não cria release. Imagens do backoffice e serviços são publicadas
  pelo `images.yml` a cada merge, com tag = SHA do commit.

## Workflow orakel

Issues nascem no repositório de planejamento `Orakel-AI-Content/workspace` e entram no
Project `Workspace`. `/spec` e `/execute` rodam neste repositório.
