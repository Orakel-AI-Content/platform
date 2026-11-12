'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  formatDateTime,
  pendingItem,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
  type StateTagColor,
} from '@/components/shared/siteLabels.ts';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, { dangerConfirmButtonProps } from '@/components/shared/ConfirmDialog.tsx';
import { TwoLines } from '@/components/shared/TwoLines';
import { Tag } from '@/components/ui/Tag';
import classNames from '@/components/ui/utils/classNames';
import type { SiteSummary } from '@/domain/sites/sites.ts';

// Estado de publicação de um site, igual na lista de sites e na página do site (#149).

export type PublishNow = (siteId: string) => Promise<ActionResult>;

/**
 * Estado de site ou de build na `Tag` do Ecme: o ponto na cor do estado (`prefixClass`) e o
 * texto no cinza da Tag, que é o que distingue os estados sem cor (#86).
 */
export function StateTag({
  color,
  className,
  children,
}: {
  color: StateTagColor;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag prefix prefixClass={color} className={className}>
      {children}
    </Tag>
  );
}

type SiteState = Pick<SiteSummary, 'id' | 'state' | 'pausedReason' | 'pausedCulprit'>;

const CULPRIT_LINK_CLASS = 'underline underline-offset-4 hover:text-primary';

/**
 * Estado do site, igual na lista e na página do site (#511): a tag e, pausado, o motivo e o
 * conteúdo culpado, com o mesmo texto e o mesmo destino da tela de pendências (`pendingItem`;
 * sem tela para a origem, como redirect, só o texto). `compact` (lista) cabe numa linha: o
 * motivo cortado é o próprio link para o culpado, com o culpado no nome acessível e, junto do
 * motivo inteiro, no `title`. Fora dele, motivo e culpado ficam cada um no seu parágrafo.
 */
export function SiteStateIndicator({
  site,
  compact = false,
}: {
  site: SiteState;
  compact?: boolean;
}) {
  const tag = (
    <StateTag color={SITE_STATE_VARIANT[site.state]}>{SITE_STATE_LABEL[site.state]}</StateTag>
  );
  const paused = site.state === 'pausado';
  const reason = paused ? site.pausedReason : null;
  const culprit =
    paused && site.pausedCulprit !== null
      ? pendingItem(site.id, site.pausedCulprit.origin, site.pausedCulprit.reference)
      : null;
  const culpritLabel = culprit && <span className="sr-only"> culpado pela pausa de {site.id}</span>;

  if (compact) {
    const shown = reason ?? culprit?.text;
    if (shown === undefined) return <TwoLines>{tag}</TwoLines>;
    const title = [reason, culprit && `Conteúdo culpado: ${culprit.text}`]
      .filter(Boolean)
      .join(' · ');
    // `relative`: os `sr-only` (absolutos) ficam presos ao corte do `truncate`; sem ele, escapam
    // e esticam a página em tela estreita (#589).
    const text = (
      <span title={title} className="relative block max-w-24 truncate">
        {shown}
        {reason && culprit && <span className="sr-only"> · {culprit.text}</span>}
        {culpritLabel}
      </span>
    );
    return (
      <TwoLines
        secondary={
          culprit?.href ? (
            <Link href={culprit.href} className={classNames('block', CULPRIT_LINK_CLASS)}>
              {text}
            </Link>
          ) : (
            text
          )
        }
      >
        {tag}
      </TwoLines>
    );
  }

  return (
    <>
      {tag}
      {reason && <p className="mt-1 font-normal">{reason}</p>}
      {culprit && (
        <p className="mt-1 font-normal">
          Conteúdo culpado:{' '}
          {culprit.href ? (
            <Link href={culprit.href} className={CULPRIT_LINK_CLASS}>
              {culprit.text}
              {culpritLabel}
            </Link>
          ) : (
            culprit.text
          )}
        </p>
      )}
    </>
  );
}

/**
 * Último build no fuso do próprio site, com a sigla (#90): o resultado e, abaixo, data e versão.
 * A data fica inteira numa linha (#585); `details` deixa a lista cortar a versão numa largura
 * máxima. "—" sem build.
 */
export function LastBuildSummary({
  build,
  timeZone,
  details = (text) => text,
}: {
  build: SiteSummary['lastBuild'];
  timeZone: string;
  details?: (text: string) => ReactNode;
}) {
  if (build === null) return <span>—</span>;
  const when = formatDateTime(new Date(build.finishedAt), timeZone);
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StateTag color={BUILD_STATUS_VARIANT[build.status]}>
        {BUILD_STATUS_LABEL[build.status]}
      </StateTag>
      <span className="flex max-w-full text-xs">
        <span className="whitespace-pre">{build.versionId ? `${when} · ` : when}</span>
        {build.versionId && <span className="min-w-0">{details(build.versionId)}</span>}
      </span>
    </span>
  );
}

/** Pendências maiores que 0 se destacam e levam à tela de pendências do site (#99). */
export function PendingCount({ siteId, count }: { siteId: string; count: number }) {
  if (count === 0) return <span>0</span>;
  return (
    <Link href={`/sites/${siteId}/pendencias`} className="inline-flex rounded-lg">
      <StateTag color="bg-warning" className="underline underline-offset-4">
        {count}
        <span className="sr-only">
          {' '}
          {count === 1 ? 'mudança pendente' : 'mudanças pendentes'} em {siteId}
        </span>
      </StateTag>
    </Link>
  );
}

/** Ação de um site que muda o site publicado: o texto do botão, do diálogo e da confirmação. */
type ConfirmedSiteAction = {
  label: string;
  pendingLabel: string;
  title: (siteId: string) => string;
  confirmText: string;
  body: ReactNode;
};

/** Confirmação de uma ação que muda o site publicado (#327): `ConfirmDialog` na cor de erro. */
function ConfirmedSiteActionDialog({
  siteId,
  isOpen,
  onCancel,
  onConfirm,
  onAfterClose,
  copy,
}: {
  siteId: string;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onAfterClose?: () => void;
  copy: ConfirmedSiteAction;
}) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      type="danger"
      title={copy.title(siteId)}
      confirmText={copy.confirmText}
      confirmButtonProps={dangerConfirmButtonProps}
      onCancel={onCancel}
      onConfirm={onConfirm}
      onAfterClose={onAfterClose}
    >
      {copy.body}
    </ConfirmDialog>
  );
}

const PUBLISH_NOW: ConfirmedSiteAction = {
  label: 'Publicar agora',
  pendingLabel: 'Enfileirando…',
  title: (siteId) => `Publicar ${siteId} agora?`,
  confirmText: 'Publicar',
  body: <p>O build entra na fila já, sem esperar a janela de agrupamento, e o site no ar muda.</p>,
};

const RESUME_SITE: ConfirmedSiteAction = {
  label: 'Retomar',
  pendingLabel: 'Retomando…',
  title: (siteId) => `Retomar ${siteId}?`,
  confirmText: 'Retomar',
  body: (
    <p>
      O site volta a receber builds e o próximo entra na fila já, publicando as mudanças represadas.
      Se o conteúdo culpado não foi corrigido, o build falha e o site pausa de novo.
    </p>
  ),
};

/** Texto de "Publicar agora" e de quando está na fila (menu da lista, etapa Build do site). */
export const PUBLISH_NOW_LABEL = { idle: PUBLISH_NOW.label, pending: PUBLISH_NOW.pendingLabel };

/**
 * A confirmação de "Publicar agora" sem o botão (lista de sites, #586; etapa Build do site, #648):
 * quem a abre guarda o estado, roda a ação no `onConfirm` e devolve o foco no `onAfterClose`.
 */
export function PublishNowDialog({
  siteId,
  isOpen,
  onCancel,
  onConfirm,
  onAfterClose,
}: {
  siteId: string;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Depois de fechar: devolve o foco a quem abriu, quando o item que abriu já não existe. */
  onAfterClose?: () => void;
}) {
  return (
    <ConfirmedSiteActionDialog
      siteId={siteId}
      isOpen={isOpen}
      copy={PUBLISH_NOW}
      onCancel={onCancel}
      onConfirm={onConfirm}
      onAfterClose={onAfterClose}
    />
  );
}

export type ResumeSite = (siteId: string) => Promise<ActionResult>;

/** Texto de "Retomar" e de quando está na fila (linha Site do site pausado). */
export const RESUME_SITE_LABEL = { idle: RESUME_SITE.label, pending: RESUME_SITE.pendingLabel };

/**
 * A confirmação de "Retomar" o site pausado (L4) sem o botão (linha Site do painel, #648): volta a
 * receber builds e enfileira o próximo já. Quem a abre guarda o estado, como no
 * `PublishNowDialog`.
 */
export function ResumeSiteDialog({
  siteId,
  isOpen,
  onCancel,
  onConfirm,
  onAfterClose,
}: {
  siteId: string;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onAfterClose?: () => void;
}) {
  return (
    <ConfirmedSiteActionDialog
      siteId={siteId}
      isOpen={isOpen}
      copy={RESUME_SITE}
      onCancel={onCancel}
      onConfirm={onConfirm}
      onAfterClose={onAfterClose}
    />
  );
}
