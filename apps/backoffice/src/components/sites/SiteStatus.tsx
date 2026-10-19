'use client';

import Link from 'next/link';
import { useTransition, type ReactNode } from 'react';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  formatDateTime,
  type StateTagColor,
} from '@/components/shared/siteLabels.ts';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
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

/**
 * Enfileira o build já, com a própria transição (cada linha da lista tem o seu "Enfileirando…");
 * `onResult` é o `report` do `useActionResult` de quem decide onde fica o erro.
 */
export function PublishNowButton({
  siteId,
  action,
  onResult,
  size = 'sm',
}: {
  siteId: string;
  action: PublishNow;
  onResult: (result: ActionResult) => void;
  /** `xs` na lista, onde a linha tem pouca largura; `sm` na página do site. */
  size?: 'xs' | 'sm';
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size={size}
      disabled={pending}
      onClick={() => startTransition(async () => onResult(await action(siteId)))}
    >
      {pending ? 'Enfileirando…' : 'Publicar agora'}
      <span className="sr-only"> {siteId}</span>
    </Button>
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
