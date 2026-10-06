import type { ContentListItem } from '@/domain/content/contents.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

/** Etapas do ciclo de vida como a operação as lê (lista de sites e página do site). */
export const LIFECYCLE_LABEL: Record<SiteSummary['lifecycle'], string> = {
  cadastrado: 'Cadastrado',
  infra_aplicada: 'Infra aplicada',
  zona_ativa: 'Zona ativa',
  publicado: 'Publicado',
};

/** Tipo do conteúdo (lista de conteúdos e versões). */
export const CONTENT_KIND_LABEL: Record<ContentListItem['kind'], string> = {
  article: 'Artigo',
  page: 'Página',
};

/** Status de uma versão de conteúdo. */
export const CONTENT_STATUS_LABEL: Record<ContentListItem['status'], string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  aprovado: 'Aprovado',
  agendado: 'Agendado',
  publicado: 'Publicado',
  despublicado: 'Despublicado',
};
