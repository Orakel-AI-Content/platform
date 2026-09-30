import { baseConfig } from '@orakel/vitest-config';

// Unidade (runtime falso) e integração com o runtime real do wrangler (o spike de
// fidelidade): src/fidelity.test.ts sobe Workers de verdade. Sem meta de cobertura.
export default {
  ...baseConfig,
  test: { ...baseConfig.test, testTimeout: 60_000, hookTimeout: 60_000 },
};
