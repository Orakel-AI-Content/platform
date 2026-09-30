import { astroComponents, layer } from '@orakel/eslint-config';

export default [
  // O Worker de borda é outra unidade, com ESLint próprio (regra da raiz).
  { ignores: ['worker/**'] },
  ...layer('app', import.meta.dirname),
  ...astroComponents,
];
