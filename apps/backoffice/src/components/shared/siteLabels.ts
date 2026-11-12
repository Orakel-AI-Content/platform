import type { Block } from '@orakel/content-model/v1';

import type { BuildKind, BuildStatus, SiteEventKind } from '@/db/schema/operations.ts';
import type { ExecutionHistoryItem, OpenExecution } from '@/domain/builds/builds.ts';
import type { BuildStage } from '@/domain/builds/run-build.ts';
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

/** Ordem fixa das etapas do ciclo de vida (stepper da página do site). */
export const LIFECYCLE_ORDER = [
  'cadastrado',
  'infra_aplicada',
  'zona_ativa',
  'publicado',
] as const satisfies readonly SiteSummary['lifecycle'][];

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
  substituido: 'Substituída',
};

/** Estado operacional de um site (lista de sites). */
export const SITE_STATE_LABEL: Record<SiteSummary['state'], string> = {
  ativo: 'Ativo',
  promovendo: 'Promovendo',
  pausado: 'Pausado',
};

/**
 * Cor do ponto da `Tag` de cada estado (o `prefixClass` da Tag do Ecme, demo `Tag/Affix`). O
 * texto fica no cinza da Tag: o `text-<cor>` sobre o `bg-<cor>-subtle` das tabelas do Ecme não
 * chega a 4,5:1 no claro.
 */
export type StateTagColor =
  | 'bg-success'
  | 'bg-info'
  | 'bg-warning'
  | 'bg-error'
  | 'bg-primary-mild'
  | 'bg-gray-400'
  | 'bg-gray-600';

/**
 * Cor da tag de cada status de conteúdo: nenhum repete a de outro. Agendado fica no azul claro
 * ao lado do azul de aprovado, como o `info`/`info-solid` do badge antigo; substituída, no cinza
 * escuro, ao lado do cinza claro de rascunho (só histórico).
 */
export const CONTENT_STATUS_TAG: Record<ContentListItem['status'], StateTagColor> = {
  rascunho: 'bg-gray-400',
  em_revisao: 'bg-warning',
  aprovado: 'bg-info',
  agendado: 'bg-primary-mild',
  publicado: 'bg-success',
  despublicado: 'bg-error',
  substituido: 'bg-gray-600',
};

/** Cor da tag de cada estado de site. */
export const SITE_STATE_VARIANT: Record<SiteSummary['state'], StateTagColor> = {
  ativo: 'bg-success',
  promovendo: 'bg-info',
  pausado: 'bg-warning',
};

/**
 * Opções de aparência da configuração do site (presets e variantes de `RESOURCES`), como a
 * operação as lê. Os valores vêm da release em tempo de execução: uma opção nova, ainda sem
 * rótulo aqui, aparece como está (`choiceLabel`).
 */
export const CHOICE_LABEL: Record<string, string> = {
  padrao: 'Padrão',
  revista: 'Revista',
  vertical: 'Vertical',
  horizontal: 'Horizontal',
};

/** Rótulo de uma opção de aparência; o próprio valor quando não há rótulo conhecido. */
export function choiceLabel(value: string): string {
  return Object.hasOwn(CHOICE_LABEL, value) ? (CHOICE_LABEL[value] as string) : value;
}

/** Estado de uma execução de build: na fila e rodando são as abertas; as demais, o resultado. */
export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  na_fila: 'Na fila',
  rodando: 'Rodando',
  ok: 'Publicado',
  failed: 'Falhou',
  cancelado: 'Cancelado',
};

/** Cor da tag de cada estado de build. */
export const BUILD_STATUS_VARIANT: Record<BuildStatus, StateTagColor> = {
  na_fila: 'bg-gray-400',
  rodando: 'bg-info',
  ok: 'bg-success',
  failed: 'bg-error',
  cancelado: 'bg-gray-600',
};

/** Tipo de um item do histórico do site (#637): as execuções de `builds` e os eventos do site. */
export const HISTORY_KIND_LABEL: Record<BuildKind | SiteEventKind, string> = {
  build: 'Publicação',
  rollback: 'Reversão',
  pausa: 'Pausa',
  retomada: 'Retomada',
  troca_de_versao: 'Troca de versão',
};

/** Etapa de uma execução de build, no detalhe de uma falha (#637). */
export const BUILD_STAGE_LABEL: Record<BuildStage, string> = {
  image: 'Imagem',
  render: 'Renderização',
  publish: 'Publicação',
};

/** Resultado de uma execução terminada, na faixa de status ao vivo (#638). */
const LIVE_RESULT_LABEL: Record<ExecutionHistoryItem['status'], string> = {
  ok: 'concluída',
  failed: 'falhou',
  cancelado: 'cancelada',
};

/**
 * Texto da faixa de status ao vivo da aba "Histórico" (#638): a execução aberta "na fila", com o
 * horário previsto no fuso do site, ou "em andamento", com a etapa quando já há uma.
 */
export function liveStatusText(open: OpenExecution, timeZone: string): string {
  const kind = HISTORY_KIND_LABEL[open.kind];
  if (open.status === 'na_fila') {
    return open.scheduledFor === null
      ? `${kind} na fila`
      : `${kind} na fila, prevista para ${formatDateTime(open.scheduledFor, timeZone)}`;
  }
  return open.currentStage === null
    ? `${kind} em andamento`
    : `${kind} em andamento, etapa: ${BUILD_STAGE_LABEL[open.currentStage]}`;
}

/** Texto da faixa quando a execução observada termina (#638): o resultado e quando. */
export function liveResultText(item: ExecutionHistoryItem, timeZone: string): string {
  const kind = HISTORY_KIND_LABEL[item.kind];
  return `${kind} ${LIVE_RESULT_LABEL[item.status]} em ${formatDateTime(item.at, timeZone)}`;
}

/** Etapas do painel da aba "Publicação" (#647), na ordem em que aparecem. */
export const PUBLICATION_STEPS = ['infra', 'versao', 'build', 'no_ar', 'site'] as const;

export type PublicationStep = (typeof PUBLICATION_STEPS)[number];

export const PUBLICATION_STEP_LABEL: Record<PublicationStep, string> = {
  infra: 'Infra e zona',
  versao: 'Versão',
  build: 'Build',
  no_ar: 'No ar',
  site: 'Site',
};

/** Estado da etapa "Infra e zona" a partir do ciclo de vida (#647). */
export const INFRA_STEP_TEXT: Record<SiteSummary['lifecycle'], string> = {
  cadastrado: 'Infra e zona pendentes',
  infra_aplicada: 'Infra aplicada, zona pendente',
  zona_ativa: 'Infra aplicada e zona ativa',
  publicado: 'Infra aplicada e zona ativa',
};

/**
 * Texto da etapa "No ar" (#647): a versão, as páginas e quando entrou no ar, no fuso do site, e
 * por quem, quando há autor.
 */
export function liveVersionText(
  versionId: string,
  pages: number | null,
  since: { at: Date; by: string | null } | null,
  timeZone: string,
): string {
  const parts = [versionId];
  if (pages !== null) parts.push(`${pages} ${pages === 1 ? 'página' : 'páginas'}`);
  if (since !== null) {
    const when = `no ar desde ${formatDateTime(since.at, timeZone)}`;
    parts.push(since.by === null ? when : `${when}, por ${since.by}`);
  }
  return parts.join(' · ');
}

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

/**
 * Duração em segundos e, a partir de 1 min, na unidade maior entre parênteses, sem componentes
 * zerados: "45 s", "300 s (5 min)", "5400 s (1 h 30 min)". Formatação própria em vez de
 * `Intl.DurationFormat` para sair igual no servidor e no navegador (#147).
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const parts = [
    [Math.floor(seconds / 3600), 'h'],
    [Math.floor((seconds % 3600) / 60), 'min'],
    [seconds % 60, 's'],
  ] as const;
  const readable = parts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value} ${unit}`)
    .join(' ');
  return `${seconds} s (${readable})`;
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
