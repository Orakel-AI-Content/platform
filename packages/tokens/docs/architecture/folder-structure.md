# Estrutura de pastas do tokens

```
themes/<id>/
├── theme.tokens.json         DTCG + $extensions["ai.orakel.theme"]
└── fonts/<nome>.woff2 + <nome>.LICENSE.txt
scripts/subset-fonts.ts       pnpm fonts (à mão; resultado commitado)
src/                          gerador (ver code-design.md) + testes
dist/                         saída do build (ignorada pelo git)
```

**Tema novo:** copie a pasta de um tema, troque o ID (slug) e os valores, rode `pnpm build` até passar no contraste. Fonte nova: acrescente em `FONTS` de `scripts/subset-fonts.ts`, rode `pnpm fonts` e declare em `fontFaces`. Depois, o seletor do backoffice passa a oferecer o tema.

**Token semântico novo:** `SEMANTIC_TOKENS` em `src/schema.ts` + todos os temas, no mesmo PR; se for cor usada em texto ou foco, avalie um par novo em `PAIRS`.

**Tipo DTCG novo** (ex.: `gradient`): schema em `VALUE_SCHEMAS`, formatação em `cssValue` e testes nos dois.

**Modo escuro:** `modes.dark` na extensão do tema, CSS em `@media (prefers-color-scheme: dark)` e contraste por modo (ADR 0008).
