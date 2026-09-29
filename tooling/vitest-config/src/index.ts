// Configuração comum do Vitest (ADR 0007). Uso numa unidade:
//
//   import { baseConfig, withCoverageThreshold } from '@orakel/vitest-config';
//   export default mergeConfig(baseConfig, withCoverageThreshold(90)); // mergeConfig de vitest/config
import { defineConfig } from 'vitest/config';

export const baseConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});

export type CoverageThreshold = {
  lines: number;
  branches: number;
};

/** Meta mínima de cobertura. Usada em content-model, core e events (90%). */
export function coverageThreshold(percent: number): CoverageThreshold {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`Cobertura deve estar entre 0 e 100, recebido: ${percent}`);
  }
  return { lines: percent, branches: percent };
}

/** Configuração parcial que liga a coverage com a meta dada. */
export function withCoverageThreshold(percent: number) {
  return defineConfig({
    test: {
      coverage: { enabled: true, thresholds: coverageThreshold(percent) },
    },
  });
}
