import { baseConfig } from '@orakel/vitest-config';
import { defineConfig } from 'vitest/config';

// Unitários, sem banco (ADR 0005 da unidade). Sem meta de cobertura (só os pacotes de
// contrato). `include` substitui o da raiz (o mergeConfig somaria as listas).
export default defineConfig({
  ...baseConfig,
  test: { ...baseConfig.test, include: ['src/**/*.test.ts'] },
});
