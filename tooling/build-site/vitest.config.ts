import { baseConfig } from '@orakel/vitest-config';

// Funções puras e orquestração com dependências falsas; o render real é testado na imagem
// (fumaça do CI) e pelo scripts/measure.ts. Sem meta de cobertura.
export default baseConfig;
