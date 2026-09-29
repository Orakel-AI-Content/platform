# 0002 – Stack e versões fixadas

- Status: aceito
- Data: 2026-09-29

## Contexto

A entrada pede TypeScript estrito e "versões fixadas de Node, pnpm, Postgres e das
imagens de apoio", sem números. Em 2026-09-29: Node 24 é o LTS ativo (Node 26 vira
LTS em 2026-10-28); TypeScript 7.0 é estável mas sem API programática (typescript-eslint
e `astro check` não rodam nele até o 7.1); pnpm 12 (reescrita em Rust) saiu em
2026-08-26 e ainda recupera funções do 11; PostgreSQL 19 está em beta.

## Decisão

- Node **24.21.0** (`.nvmrc`, `engines`, `devEngines.runtime`).
- pnpm **11.28.2** (`packageManager`).
- TypeScript **6.0**, `strict` + `noUncheckedIndexedAccess`.
- PostgreSQL **18.6** (`postgres:18.6-alpine`) e SeaweedFS **4.48**, presos por tag e digest.
- Renovate mantém as versões; atualizações de major passam por PR revisado.

## Alternativas consideradas

- Node 26 desde já — evita uma troca em um mês, mas ainda é "Current".
- pnpm 12 — instalações mais rápidas, mas a reescrita é recente.
- TypeScript 7 com `@typescript/typescript6` lado a lado — compilação mais rápida,
  configuração mais complexa.

## Consequências

- Migrar para Node 26 depois de 2026-10-28 e para TypeScript 7.1 quando o
  typescript-eslint suportar (em `open_questions`).
- O `minimumReleaseAge` de 24 h do pnpm 11 cabe na janela de 48 h das correções
  críticas, com pouca folga.
