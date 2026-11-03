'use client';

import Link from 'next/link';
import { useState, useTransition, type ReactNode } from 'react';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  formatDateTime,
  type StateTagColor,
} from '@/components/shared/siteLabels.ts';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
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

/** Ação de um site que muda o site publicado: o texto do botão, do diálogo e da confirmação. */
type ConfirmedSiteAction = {
  label: string;
  pendingLabel: string;
  title: (siteId: string) => string;
  confirmText: string;
  body: ReactNode;
};

/**
 * Botão de uma ação que muda o site publicado (#327): pede confirmação num `ConfirmDialog`, na
 * cor de erro, e roda com a própria transição (cada linha da lista tem o seu "Enfileirando…");
 * `onResult` é o `report` do `useActionResult` de quem decide onde fica o erro.
 */
function ConfirmedSiteActionButton({
  siteId,
  action,
  onResult,
  copy,
}: {
  siteId: string;
  action: (siteId: string) => Promise<ActionResult>;
  onResult: (result: ActionResult) => void;
  copy: ConfirmedSiteAction;
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
        {pending ? copy.pendingLabel : copy.label}
        <span className="sr-only"> {siteId}</span>
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        type="danger"
        title={copy.title(siteId)}
        confirmText={copy.confirmText}
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          startTransition(async () => onResult(await action(siteId)));
        }}
      >
        {copy.body}
      </ConfirmDialog>
    </>
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

/** Enfileira o build já, sem esperar a janela; muda o site publicado. */
export function PublishNowButton({
  siteId,
  action,
  onResult,
}: {
  siteId: string;
  action: PublishNow;
  onResult: (result: ActionResult) => void;
}) {
  return (
    <ConfirmedSiteActionButton
      siteId={siteId}
      action={action}
      onResult={onResult}
      copy={PUBLISH_NOW}
    />
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

export type ResumeSite = (siteId: string) => Promise<ActionResult>;

/**
 * "Retomar" o site pausado (L4), com o erro logo abaixo (página do site): volta a receber
 * builds e enfileira o próximo já.
 */
export function ResumeSitePanel({ siteId, action }: { siteId: string; action: ResumeSite }) {
  const { error, report } = useActionResult();
  return (
    <div className="space-y-2">
      <ConfirmedSiteActionButton
        siteId={siteId}
        action={action}
        onResult={report}
        copy={RESUME_SITE}
      />
      <ActionAlert error={error} />
    </div>
  );
}
