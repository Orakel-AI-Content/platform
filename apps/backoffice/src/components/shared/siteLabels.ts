import type { InfraChange } from '@orakel/build-contract';
import type { Block } from '@orakel/content-model/v1';

import type {
  BuildKind,
  BuildStatus,
  InfraResourceStep,
  InfraRunKind,
  InfraStep,
  SiteEventKind,
} from '@/db/schema/operations.ts';
import type {
  ExecutionHistoryItem,
  OpenExecution,
  SiteHistoryItem,
} from '@/domain/builds/builds.ts';
import type { BuildStage } from '@/domain/builds/run-build.ts';
import type { InfraHistoryItem, OpenInfraRun } from '@/domain/infra/runs.ts';
import type { ContentListItem } from '@/domain/content/contents.ts';
import type { PendingOrigin } from '@/domain/pending-changes/record.ts';
import type { SiteInfraCheck, SiteSummary } from '@/domain/sites/sites.ts';

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

/** Item do histórico de uma execução da infraestrutura (`infra_runs`), pelo tipo. */
export const INFRA_RUN_KIND_LABEL = {
  criar: 'Criação da infraestrutura',
  remover: 'Remoção da infraestrutura',
  reaplicar: 'Reaplicação da infraestrutura',
} as const satisfies Record<InfraRunKind, string>;

/**
 * Uma execução de infra (`infra_runs`) pelo tipo, no histórico e na faixa ao vivo: a criação, a
 * remoção (workspace#97) e a reaplicação (workspace#98).
 */
export function infraRunLabel(kind: InfraRunKind): string {
  return INFRA_RUN_KIND_LABEL[kind];
}

/**
 * Etapas do módulo na criação da infraestrutura (`INFRA_RESOURCE_STEPS`), na mesma ordem, nos termos de quem opera
 * (#825): o resumo do plano e o andamento listam nesta ordem.
 */
export const INFRA_STEP_LABEL = {
  endereco: 'Endereço',
  dns: 'Registros de DNS',
  email: 'E-mail',
  regras: 'Regras',
  imagens: 'Armazenamento de imagens',
} as const satisfies Record<InfraResourceStep, string>;

/** As etapas na ordem do `INFRA_STEP_LABEL` (sem importar o schema do banco no navegador). */
export const INFRA_STEP_ORDER = Object.keys(INFRA_STEP_LABEL) as InfraResourceStep[];

/** O que o plano faz com um recurso, no resumo de uma etapa. */
const INFRA_ACTION_TEXT: Record<InfraChange['action'], string> = {
  create: 'a criar',
  update: 'a alterar',
  replace: 'a recriar',
  delete: 'a remover',
};

/** Resumo de uma etapa do plano: "2 a criar · 1 a alterar", ou "Nada muda" sem recursos. */
export function infraStepChangesText(changes: readonly InfraChange[]): string {
  if (changes.length === 0) return 'Nada muda';
  return (Object.keys(INFRA_ACTION_TEXT) as InfraChange['action'][])
    .map((action) => [action, changes.filter((change) => change.action === action).length] as const)
    .filter(([, count]) => count > 0)
    .map(([action, count]) => `${count} ${INFRA_ACTION_TEXT[action]}`)
    .join(' · ');
}

/**
 * "Remover infraestrutura" (workspace#97): as páginas publicadas, que saem com o Worker do site
 * (fora do plano do OpenTofu), no resumo do que será apagado.
 */
export const INFRA_REMOVAL_PAGES_LABEL = 'Páginas publicadas';

/**
 * As páginas no ar que a remoção apaga: "12 a remover", ou "Nada no ar" sem versão ativa
 * (`null`) ou sem página.
 */
export function infraRemovalPagesText(activePages: number | null): string {
  return activePages === null || activePages === 0 ? 'Nada no ar' : `${activePages} a remover`;
}

/** O que a remoção não toca: fica no Backoffice e nos originais, para recriar depois. */
export const INFRA_REMOVAL_KEPT = [
  'Conteúdo e histórico do site no Backoffice',
  'Originais das imagens',
  'Cadastro e configuração do site',
] as const;

/** Por que "Remover infraestrutura" está desabilitada com o site ativo. */
export const INFRA_REMOVAL_PAUSE_FIRST = 'Para remover a infraestrutura, pause o site antes.';

/** Selo da etapa Infra e zona quando a conferência achou a infra fora da descrição (workspace#98). */
export const INFRA_OUTDATED_LABEL = 'Infra desatualizada';

/** Resultado de uma reaplicação concluída, no histórico do site (workspace#98). */
export const INFRA_REAPPLY_OK_TEXT = 'Infraestrutura em dia com a descrição atual';

/** Etapa de uma execução de infra: as do módulo e, só na remoção, as páginas do site. */
export function infraRunStepLabel(step: InfraStep): string {
  return step === 'paginas' ? 'Páginas do site' : INFRA_STEP_LABEL[step];
}

/** A execução da infraestrutura mais recente do histórico com o tipo pedido; `undefined` sem nenhuma. */
export function latestInfraRun(
  history: readonly SiteHistoryItem[],
  kind: InfraRunKind,
): InfraHistoryItem | undefined {
  return history.find(
    (item): item is InfraHistoryItem => item.type === 'infra' && item.kind === kind,
  );
}

/**
 * A criação da infraestrutura mais recente do histórico (#826), que decide "Tentar de novo" e
 * os nameservers da etapa Infra e zona; `undefined` se o site nunca teve uma.
 */
export function latestInfraCreation(
  history: readonly SiteHistoryItem[],
): InfraHistoryItem | undefined {
  return latestInfraRun(history, 'criar');
}

/**
 * A remoção da infraestrutura mais recente do histórico (workspace#97), que decide "Tentar de
 * novo" da remoção; `undefined` se o site nunca teve uma.
 */
export function latestInfraRemoval(
  history: readonly SiteHistoryItem[],
): InfraHistoryItem | undefined {
  return latestInfraRun(history, 'remover');
}

/**
 * Faixa ao vivo da execução aplicando (criação, remoção ou reaplicação): o tipo e a etapa
 * corrente, quando já há uma.
 */
export function infraLiveStatusText(open: Pick<OpenInfraRun, 'kind' | 'currentStep'>): string {
  const label = infraRunLabel(open.kind);
  return open.currentStep === null
    ? `${label} em andamento`
    : `${label} em andamento, etapa: ${infraRunStepLabel(open.currentStep)}`;
}

/** "falhou", com a etapa quando a falha teve uma. */
const infraFailedText = (step: InfraStep | null) =>
  step === null ? 'falhou' : `falhou na etapa ${infraRunStepLabel(step)}`;

/** A falha de uma execução de infra no histórico: a etapa, quando houve uma, e o motivo. */
export function infraFailureText(failure: NonNullable<InfraHistoryItem['failure']>): string {
  const failed = infraFailedText(failure.step);
  return failure.message === null ? failed : `${failed}: ${failure.message}`;
}

/**
 * Faixa quando a execução acompanhada termina: o tipo, concluída, ou a etapa e o motivo da
 * falha.
 */
export function infraLiveResultText(item: InfraHistoryItem, timeZone: string): string {
  const at = formatDateTime(item.at, timeZone);
  const label = infraRunLabel(item.kind);
  if (item.status === 'ok') return `${label} concluída em ${at}`;
  const { step, message } = item.failure ?? { step: null, message: null };
  const text = `${label} ${infraFailedText(step)} em ${at}`;
  return message === null ? text : `${text}: ${message}`;
}

/** Etapa de uma execução de build, no detalhe de uma falha (#637). */
export const BUILD_STAGE_LABEL: Record<BuildStage, string> = {
  image: 'Imagem',
  render: 'Renderização',
  publish: 'Publicação',
};

/**
 * Título de um item da linha do tempo do histórico (#651): o tipo e, na execução, o resultado
 * que o status sozinho não diz (o cancelamento e a etapa da falha); na pausa, o motivo.
 */
export function historyItemTitle(item: SiteHistoryItem): string {
  if (item.type === 'infra') {
    const label = infraRunLabel(item.kind);
    return item.status === 'falhou'
      ? `${label} · ${infraFailedText(item.failure?.step ?? null)}`
      : label;
  }
  const kind = HISTORY_KIND_LABEL[item.kind];
  if (item.type === 'evento') {
    return item.kind === 'pausa' && item.reason ? `${kind}: ${item.reason}` : kind;
  }
  if (item.status === 'cancelado') return `${kind} cancelada`;
  if (item.status === 'failed') {
    const stage = item.failure?.stage;
    return stage ? `${kind} · falhou na etapa ${BUILD_STAGE_LABEL[stage]}` : `${kind} · falhou`;
  }
  return kind;
}

/** Resultado de uma execução terminada, na faixa de status ao vivo (#638). */
const LIVE_RESULT_LABEL: Record<ExecutionHistoryItem['status'], string> = {
  ok: 'concluída',
  failed: 'falhou',
  cancelado: 'cancelada',
};

/**
 * Texto da faixa de status ao vivo da aba "Publicação" (#638, #647): a execução aberta "na fila", com o
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

/** Estado da etapa "Versão" (#690): a release em uso, ou que o site ainda não tem nenhuma. */
export function releaseInUseText(release: string | null): string {
  return release === null ? 'Nenhuma versão' : `${release} em uso`;
}

/** A `Tag` da etapa "Versão" (#690) quando há release disponível mais recente que a do site. */
export function releaseAvailableText(tag: string): string {
  return `${tag} disponível`;
}

/** O botão "Voltar à versão anterior" da etapa "Versão" (#691), com a release de destino. */
export function revertReleaseText(tag: string): string {
  return `Voltar à versão anterior (${tag})`;
}

/** Estado da etapa "Infra e zona" a partir do ciclo de vida (#647). */
export const INFRA_STEP_TEXT: Record<SiteSummary['lifecycle'], string> = {
  cadastrado: 'Infra e zona pendentes',
  infra_aplicada: 'Infra aplicada, zona pendente',
  zona_ativa: 'Infra aplicada e zona ativa',
  publicado: 'Infra aplicada e zona ativa',
};

/** Quanto tempo passou desde `since`, em pt-BR ("há 5 minutos"); o futuro conta como agora. */
export function agoText(since: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - since.getTime()) / 60_000);
  if (minutes < 1) return 'há menos de 1 minuto';
  if (minutes < 60) return `há ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/**
 * Situação da conferência automática na etapa "Infra e zona" (workspace#85), abaixo do
 * `INFRA_STEP_TEXT`: "Conferindo…" com conferência na fila; a falha do provedor com a mensagem
 * (não é etapa pendente); o que a última conferência detectou, com o motivo de não ter avançado;
 * "Ainda não conferido" numa etapa que a conferência ainda avança. Etapa já concluída sem
 * conferência gravada (marcada antes da conferência automática) não tem o que dizer: `null`.
 */
export function infraCheckText(check: SiteInfraCheck, now: Date): string | null {
  if (check.queued) return 'Conferindo…';
  const pending = check.lifecycle === 'cadastrado' || check.lifecycle === 'infra_aplicada';
  if (check.checkedAt === null) return pending ? 'Ainda não conferido' : null;
  const ago = `conferido ${agoText(check.checkedAt, now)}`;
  if (check.error !== null) {
    return `Não foi possível consultar o provedor (${ago}): ${check.error}`;
  }
  if (check.lifecycle === 'cadastrado') return `Zona não encontrada no provedor (${ago})`;
  if (check.lifecycle === 'infra_aplicada') {
    return `Infra detectada sozinha, zona ainda pendente no provedor (${ago})`;
  }
  return `Detectado sozinho (${ago})`;
}

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

/**
 * Versão de destino do "Desfazer última publicação" (#649), na confirmação: a versão, a release, as
 * páginas e quando foi publicada, no fuso do site.
 */
export function previousVersionText(
  version: { versionId: string; release: string; pages: number | null; finishedAt: Date },
  timeZone: string,
): string {
  const parts = [version.versionId, `release ${version.release}`];
  if (version.pages !== null) {
    parts.push(`${version.pages} ${version.pages === 1 ? 'página' : 'páginas'}`);
  }
  parts.push(`publicada em ${formatDateTime(version.finishedAt, timeZone)}`);
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
