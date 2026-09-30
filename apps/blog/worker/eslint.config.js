import { layer } from '@orakel/eslint-config';

export default [
  // Gerado por `wrangler types`.
  { ignores: ['worker-configuration.d.ts'] },
  ...layer('app', import.meta.dirname),
];
