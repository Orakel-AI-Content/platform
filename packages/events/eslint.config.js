import { layer } from '@orakel/eslint-config';

export default [
  ...layer('domain', import.meta.dirname),
  {
    // Script do navegador (ADR 0004): nada de Zod nem de código de runtime do servidor,
    // só tipos (import type) — o orçamento é de 1 a 2 kB.
    files: ['src/v1/client/**'],
    ignores: ['src/v1/client/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'zod', message: 'O script do navegador não pode carregar o Zod.' }],
          patterns: [
            {
              group: ['../payload*', '../manifest*', '../layout*', '../index*'],
              allowTypeImports: true,
              message: 'No client/, importe só tipos destes módulos (eles carregam o Zod).',
            },
          ],
        },
      ],
    },
  },
];
