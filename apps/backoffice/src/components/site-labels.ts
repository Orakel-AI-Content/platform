import type { SiteSummary } from '@/domain/sites/sites.ts';

/** Etapas do ciclo de vida como a operação as lê (lista de sites e página do site). */
export const LIFECYCLE_LABEL: Record<SiteSummary['lifecycle'], string> = {
  cadastrado: 'Cadastrado',
  infra_aplicada: 'Infra aplicada',
  zona_ativa: 'Zona ativa',
  publicado: 'Publicado',
};
