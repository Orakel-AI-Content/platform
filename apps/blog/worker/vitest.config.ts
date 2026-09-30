import { baseConfig } from '@orakel/vitest-config';

// Testes em Node, sem o runtime da Cloudflare (ADR 0003): regras puras, fluxo e o
// handler com env falso. Sem meta de cobertura (a raiz só exige nos pacotes de contrato).
export default baseConfig;
