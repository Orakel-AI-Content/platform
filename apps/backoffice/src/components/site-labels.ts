import type { Block } from '@orakel/content-model/v1';

import type { BadgeVariant } from '@/components/ui/badge';
import type { LastBuild } from '@/domain/builds/builds.ts';
import type { ContentListItem } from '@/domain/content/contents.ts';
import type { PendingOrigin } from '@/domain/pending-changes/record.ts';
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

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * Data e hora no fuso do site, com a sigla ("01/10/2026, 09:00 BRT"), igual no servidor e no
 * navegador: o fuso é sempre o do site (`SiteSummary.timeZone`), nunca o de quem lê (#90).
 * Campos explícitos porque `dateStyle`/`timeStyle` não aceitam `timeZoneName`.
 */
export function formatDateTime(date: Date, timeZone: string): string {
  let format = dateTimeFormats.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    });
    dateTimeFormats.set(timeZone, format);
  }
  return format.format(date);
}

/** Tipo de taxonomia (lista de taxonomias e seletor do editor). */
export const TAXONOMY_KIND_LABEL: Record<'category' | 'tag' | 'series', string> = {
  category: 'Categoria',
  tag: 'Tag',
  series: 'Série',
};

/** Origem de uma mudança pendente (tela de pendências, #99). */
export const PENDING_ORIGIN_LABEL: Record<PendingOrigin, string> = {
  config: 'Configuração',
  content: 'Conteúdo',
  author: 'Autor',
  taxonomy: 'Taxonomia',
  menu: 'Menu',
  media: 'Mídia',
  redirect: 'Redirecionamento',
  release: 'Release',
  platform: 'Plataforma',
};

/** Tela de cada origem, quando existe; mídia vai à biblioteca (não há tela por imagem). */
const PENDING_ORIGIN_PATH: Partial<Record<PendingOrigin, (reference: string) => string>> = {
  config: () => 'configuracao',
  content: (id) => `conteudos/${id}`,
  author: (id) => `autores/${id}`,
  taxonomy: (id) => `taxonomias/${id}`,
  menu: (id) => `menus/${id}`,
  media: () => 'midia',
};

/**
 * Item de uma mudança pendente: o texto ("Conteúdo 42", "Configuração v3") e o link para a
 * tela dele, se houver. Mostra o identificador gravado, não o título do item.
 */
export function pendingItem(
  siteId: string,
  origin: PendingOrigin,
  reference: string,
): { text: string; href?: string } {
  const text = `${PENDING_ORIGIN_LABEL[origin]} ${reference}`;
  const path = PENDING_ORIGIN_PATH[origin];
  return path ? { text, href: `/sites/${siteId}/${path(reference)}` } : { text };
}
