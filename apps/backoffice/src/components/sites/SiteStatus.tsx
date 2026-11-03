'use client';

import Link from 'next/link';
import { useState, useTransition, type ReactNode } from 'react';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  formatDateTime,
  pendingItem,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
  type StateTagColor,
} from '@/components/shared/siteLabels.ts';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import { TwoLines } from '@/components/shared/TwoLines';
import { Button } from '@/components/ui/Button';
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
    const text = (
      <span title={title} className="block max-w-24 truncate">
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
 * `details` deixa a lista cortar a linha de baixo numa largura máxima; "—" sem build.
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
  const when = `${formatDateTime(new Date(build.finishedAt), timeZone)}${build.versionId ? ` · ${build.versionId}` : ''}`;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StateTag color={BUILD_STATUS_VARIANT[build.status]}>
        {BUILD_STATUS_LABEL[build.status]}
      </StateTag>
      <span className="text-xs">{details(when)}</span>
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

/**
 * Enfileira o build já, com a própria transição (cada linha da lista tem o seu "Enfileirando…");
 * `onResult` é o `report` do `useActionResult` de quem decide onde fica o erro. Muda o site
 * publicado sem esperar a janela: pede confirmação, na cor de erro (#327).
 */
export function PublishNowButton({
  siteId,
  action,
  onResult,
}: {
  siteId: string;
  action: PublishNow;
  onResult: (result: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={pending}
        customColorClass={dangerButtonClass}
        onClick={() => setConfirming(true)}
      >
        {pending ? 'Enfileirando…' : 'Publicar agora'}
        <span className="sr-only"> {siteId}</span>
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        type="danger"
        title={`Publicar ${siteId} agora?`}
        confirmText="Publicar"
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          startTransition(async () => onResult(await action(siteId)));
        }}
      >
        <p>O build entra na fila já, sem esperar a janela de agrupamento, e o site no ar muda.</p>
      </ConfirmDialog>
    </>
  );
}

/** "Publicar agora" de um site só, com o erro logo abaixo (página do site). */
export function PublishNowPanel({ siteId, action }: { siteId: string; action: PublishNow }) {
  const { error, report } = useActionResult();
  return (
    <div className="space-y-2">
      <PublishNowButton siteId={siteId} action={action} onResult={report} />
      <ActionAlert error={error} />
    </div>
  );
}
