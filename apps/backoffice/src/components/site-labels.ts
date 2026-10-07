import type { Block } from '@orakel/content-model/v1';

import type { BadgeVariant } from '@/components/ui/badge';
import type { LastBuild } from '@/domain/builds/builds.ts';
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

/** Tipo de bloco (editor e leitura de uma versão). */
export const BLOCK_TYPE_LABEL: Record<Block['type'], string> = {
  text: 'Texto',
  toc: 'Sumário',
  quote: 'Citação',
  image: 'Imagem',
  faq: 'FAQ',
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

/** Variante do badge de cada status de conteúdo: nenhum repete a de outro. */
export const CONTENT_STATUS_VARIANT: Record<ContentListItem['status'], BadgeVariant> = {
  rascunho: 'muted',
  em_revisao: 'warning',
  aprovado: 'info',
  agendado: 'info-solid',
  publicado: 'success-solid',
  despublicado: 'outline',
};

/** Estado operacional de um site (lista de sites). */
export const SITE_STATE_LABEL: Record<SiteSummary['state'], string> = {
  ativo: 'Ativo',
  promovendo: 'Promovendo',
  pausado: 'Pausado',
};

/** Variante do badge de cada estado de site. */
export const SITE_STATE_VARIANT: Record<SiteSummary['state'], BadgeVariant> = {
  ativo: 'success',
  promovendo: 'info',
  pausado: 'warning',
};

/** Resultado do último build de um site (lista de sites). */
export const BUILD_STATUS_LABEL: Record<LastBuild['status'], string> = {
  ok: 'Publicado',
  failed: 'Falhou',
};

/** Variante do badge de cada resultado de build. */
export const BUILD_STATUS_VARIANT: Record<LastBuild['status'], BadgeVariant> = {
  ok: 'success',
  failed: 'destructive',
};

/** Data e hora no fuso da operação (tabelas e páginas de conteúdo). */
export const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** Tipo de taxonomia (lista de taxonomias e seletor do editor). */
export const TAXONOMY_KIND_LABEL: Record<'category' | 'tag' | 'series', string> = {
  category: 'Categoria',
  tag: 'Tag',
  series: 'Série',
};
