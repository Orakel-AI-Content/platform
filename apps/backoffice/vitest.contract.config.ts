import { baseConfig } from '@orakel/vitest-config';
import { defineConfig } from 'vitest/config';

// Contrato e integração com Postgres (DATABASE_URL). No CI: job "Contrato da API de exportação".
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['test/contract/**/*.test.ts'],
    // Um arquivo por vez: os testes compartilham o mesmo banco.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
