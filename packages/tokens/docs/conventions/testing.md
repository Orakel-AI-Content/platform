# Testes do tokens

- `contrast.test.ts`: valores de referência da WCAG (21:1, `#767676` × `#777777` sobre branco), pares abaixo do mínimo, transparência.
- `resolve.test.ts`: `$type` herdado, aliases em cadeia e em campos de sombra, alias inexistente, ciclo, tipo diferente, valores inválidos (incluindo `hex` que não bate com `components`), nomes inválidos.
- `css.test.ts`: nome das variáveis, formatação por tipo, CSS completo com `@font-face` e só semânticos.
- `build.test.ts`: build dos temas reais em pasta temporária (arquivos, hash, `index.js` importado de verdade, `index.d.ts`), idempotência e temas inválidos (cópia dos reais alterada) com problemas agregados e nada gravado.
- Sem meta de cobertura. Rodar: `pnpm test` · o build real: `pnpm build`.
