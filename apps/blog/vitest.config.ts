import { baseConfig } from '@orakel/vitest-config';

// Unidades do app (rotas, fontes de dados, orçamento, env). As páginas são verificadas
// no build dos sites de exemplo (axe e paridade, Playwright). Sem meta de cobertura.
export default {
  ...baseConfig,
  test: { ...baseConfig.test, include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] },
};
