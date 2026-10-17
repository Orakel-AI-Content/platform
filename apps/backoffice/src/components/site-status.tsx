'use client';

import Link from 'next/link';
import { useState, useTransition, type ReactNode } from 'react';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  formatDateTime,
} from '@/components/site-labels.ts';
import { Badge } from '@/components/legacy-ui/badge';
import { buttonVariants } from '@/components/legacy-ui/button';
import type { SiteSummary } from '@/domain/sites/sites.ts';

// Estado de publicação de um site, igual na lista de sites e na página do site (#149).

export type PublishStatus = { ok: boolean; message: string };
export type PublishNow = (siteId: string) => Promise<PublishStatus>;

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
  if (build === null) return <span className="text-muted-foreground">—</span>;
  const when = `${formatDateTime(new Date(build.finishedAt), timeZone)}${build.versionId ? ` · ${build.versionId}` : ''}`;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span>
        <Badge variant={BUILD_STATUS_VARIANT[build.status]}>
          {BUILD_STATUS_LABEL[build.status]}
        </Badge>
      </span>
      <span className="text-xs text-muted-foreground">{details(when)}</span>
    </span>
  );
}

/** Pendências maiores que 0 se destacam e levam à tela de pendências do site (#99). */
export function PendingCount({ siteId, count }: { siteId: string; count: number }) {
  if (count === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <Link href={`/sites/${siteId}/pendencias`} className="inline-flex rounded-md">
      <Badge variant="warning" className="underline underline-offset-4">
        {count}
        <span className="sr-only">
          {' '}
          {count === 1 ? 'mudança pendente' : 'mudanças pendentes'} em {siteId}
        </span>
      </Badge>
    </Link>
  );
}

/** Enfileira o build já; quem o usa decide onde fica a região `role="status"` do retorno. */
export function PublishNowButton({
  siteId,
  action,
  onResult,
}: {
  siteId: string;
  action: PublishNow;
  onResult: (status: PublishStatus) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => onResult(await action(siteId)))}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {pending ? 'Enfileirando…' : 'Publicar agora'}
      <span className="sr-only"> {siteId}</span>
    </button>
  );
}

/** Região `role="status"` do retorno de "Publicar agora". */
export function PublishStatusRegion({ status }: { status: PublishStatus | null }) {
  return (
    <p
      role="status"
      className={
        status?.ok === false ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
      }
    >
      {status?.message}
    </p>
  );
}

/** "Publicar agora" de um site só, com o retorno logo abaixo (página do site). */
export function PublishNowPanel({ siteId, action }: { siteId: string; action: PublishNow }) {
  const [status, setStatus] = useState<PublishStatus | null>(null);
  return (
    <div className="space-y-2">
      <PublishNowButton siteId={siteId} action={action} onResult={setStatus} />
      <PublishStatusRegion status={status} />
    </div>
  );
}
