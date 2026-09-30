import nextPlugin from '@next/eslint-plugin-next';
import { layer } from '@orakel/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['.next/**', 'next-env.d.ts', 'drizzle/**', 'playwright-report/**', 'test-results/**'],
  },
  ...layer('app', import.meta.dirname),
  nextPlugin.configs['core-web-vitals'],
  reactHooks.configs.flat.recommended,
];
