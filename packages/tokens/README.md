# @orakel/tokens

Temas dos sites: um JSON [DTCG](https://www.designtokens.org/tr/2025.10/format/) por tema
(`themes/<id>/theme.tokens.json`) vira variáveis CSS e `@font-face`. O build verifica o
contraste WCAG AA dos pares fixos e falha abaixo do mínimo.

```ts
import { themeCss, themeFonts, THEME_IDS } from '@orakel/tokens';

const css = themeCss(config.theme); // undefined → tema inexistente: falha permanente
const preload = themeFonts(config.theme)?.filter((font) => font.preload);
```

```css
.card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
```

Arquivos: `@orakel/tokens/themes/<id>.css` e `@orakel/tokens/fonts/<arquivo>` (servidos em
`/fonts/` pelo blog).

Comandos (nesta pasta): `pnpm build` · `pnpm test` · `pnpm lint` · `pnpm typecheck` ·
`pnpm fonts` (baixa as fontes dos temas; à mão). Container limpo (da raiz):
`docker buildx bake tokens-test`. Documentação: `docs/README.md`.
