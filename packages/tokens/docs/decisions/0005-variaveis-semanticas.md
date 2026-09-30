# 0005 – Variáveis: caminho do token, sem prefixo, só semânticas

- Status: aceito
- Data: 2026-09-29

## Decisão

- Nome da variável = caminho do token com `-`: `color.text-muted` → `--color-text-muted`.
- Sem prefixo: os sites são só da plataforma e não há colisão (o Pagefind usa `--pagefind-ui-*`).
- O grupo `palette` guarda os primitivos, usados só por aliases; nunca vira variável. Componentes não usam cor crua, e trocar o tema continua sendo trocar só as variáveis semânticas.
- Conjunto fixo (`SEMANTIC_TOKENS` em `src/schema.ts`), 38 tokens: `color.*` (9), `font.family.*` (3), `font.size.*` e `font.line-height.*` (`sm`–`3xl`), `space.1`–`8`, `radius.*` (`sm`, `md`, `lg`, `full`), `shadow.*` (`sm`, `md`). Faltar, sobrar ou ter o tipo errado quebra o build.
- Variáveis em ordem alfabética: a mesma entrada gera o mesmo CSS.

## Consequências

Token semântico novo: entra em `SEMANTIC_TOKENS` e em todos os temas no mesmo PR.
