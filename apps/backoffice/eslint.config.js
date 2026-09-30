import nextPlugin from '@next/eslint-plugin-next';
import { layer } from '@orakel/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['.next/**', 'next-env.d.ts', 'drizzle/**', 'playwright-report/**', 'test-results/**'],
  },
  ...layer('app', import.meta.dirname),
  nextPlugin.configs['core-web-vitals'],
  // O lefthook roda o ESLint a partir da raiz: o plugin do Next precisa saber onde está o app.
  { settings: { next: { rootDir: import.meta.dirname } } },
  reactHooks.configs.flat.recommended,
];
