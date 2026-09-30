import { layer } from '@orakel/eslint-config';

export default [
  ...layer('domain', import.meta.dirname),
  {
    // Exceção da raiz (ADR 0003): só o subcaminho /astro pode importar o Astro.
    files: ['src/v*/astro/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/apps/**'], message: 'Nunca importe de um app; extraia para um pacote.' },
            {
              group: ['@orakel/*/src/**'],
              message: 'Importe pelo exports do pacote, não por src/.',
            },
            {
              group: ['react', 'react/**', 'react-dom', 'react-dom/**'],
              message: 'React só em packages/ui e nos apps.',
            },
            { group: ['next', 'next/**'], message: 'Next só em apps/backoffice.' },
          ],
        },
      ],
    },
  },
];
