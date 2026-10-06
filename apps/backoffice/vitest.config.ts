import { fileURLToPath } from 'node:url';

import { baseConfig } from '@orakel/vitest-config';
import { defineConfig } from 'vitest/config';

// Unitários, sem banco (ADR 0005 da unidade). Sem meta de cobertura (só os pacotes de
// contrato). `include` substitui o da raiz (o mergeConfig somaria as listas). Componentes
// (`*.test.tsx`) declaram o DOM no arquivo: `// @vitest-environment happy-dom`.
export default defineConfig({
  ...baseConfig,
  // O alias `@/` da interface (tsconfig), para testar rotas e telas.
  resolve: { alias: { '@': fileURLToPath(new URL('src', import.meta.url)) } },
  test: { ...baseConfig.test, include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
