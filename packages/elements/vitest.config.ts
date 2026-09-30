import { baseConfig } from '@orakel/vitest-config';

// DOM do happy-dom: sem layout, então as posições de rolagem são simuladas nos testes. O
// comportamento em navegador real é testado no blog (e2e/interactions.spec.ts). Sem meta
// de cobertura.
export default {
  ...baseConfig,
  test: { ...baseConfig.test, environment: 'happy-dom' },
};
