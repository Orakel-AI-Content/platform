import { mergeConfig } from 'vitest/config';
import { baseConfig, withCoverageThreshold } from '@orakel/vitest-config';

// Contrato compartilhado: meta de 90% de linhas e branches (ADR 0007 da raiz).
export default mergeConfig(baseConfig, withCoverageThreshold(90));
