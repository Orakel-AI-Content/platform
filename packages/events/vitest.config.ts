import { mergeConfig } from 'vitest/config';
import { baseConfig, withCoverageThreshold } from '@orakel/vitest-config';

// Contrato compartilhado: meta de 90% de linhas e branches (ADR 0007 da raiz). O tsconfig
// do client/ fica dentro de src/, então sai da cobertura.
export default mergeConfig(mergeConfig(baseConfig, withCoverageThreshold(90)), {
  test: { coverage: { exclude: ['src/**/tsconfig.json'] } },
});
