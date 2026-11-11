// Ecme v1.3.10 (e5f9a1d): src/views/dashboards/AnalyticDashboard/components/Metrics.tsx
// Adaptado (#596), no mesmo porte do `AudienceMetrics` (#548):
// - um cartão por status de conteúdo (a versão mais recente de cada um) e um de publicações de
//   hoje; cada cartão de status é um link para a lista filtrada (`?status=`), e "Em revisão",
//   para a fila de revisão; sem `GrowShrinkValue` (não há comparação com um período anterior);
// - número com `Intl.NumberFormat('pt-BR')` (`formatCount`), em `p.h3 tabular-nums`: o valor
//   não é título de seção;
// - círculo do ícone nos `*-subtle` da paleta do Backoffice; o ícone é `aria-hidden`;
// - em grade (1 coluna no celular, 2 a partir de `sm`, 3 a partir de `lg`, 6 a partir de
//   `2xl`), com o título "Conteúdos" e os atalhos "Criar conteúdo" e "Revisar" acima.
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  TbCalendarCheck,
  TbCircleCheck,
  TbClipboardCheck,
  TbClock,
  TbPencil,
  TbPlus,
  TbWorld,
} from 'react-icons/tb';

import { formatCount } from '@/components/audience/format.ts';
import { CONTENT_STATUS_LABEL } from '@/components/shared/siteLabels.ts';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Card from '@/components/ui/Card';
import classNames from '@/components/ui/utils/classNames';
import type { ContentStatusCounts } from '@/domain/content/contents.ts';

/** Os status com cartão, na ordem do fluxo editorial; `despublicado` e `substituido` ficam fora. */
const CARD_STATUSES = ['rascunho', 'em_revisao', 'aprovado', 'agendado', 'publicado'] as const;

type CardStatus = (typeof CARD_STATUSES)[number];

const STATUS_ICON: Record<CardStatus, { icon: ReactNode; iconClass: string }> = {
  rascunho: { icon: <TbPencil />, iconClass: 'bg-primary-subtle' },
  em_revisao: { icon: <TbClipboardCheck />, iconClass: 'bg-warning-subtle' },
  aprovado: { icon: <TbCircleCheck />, iconClass: 'bg-info-subtle' },
  agendado: { icon: <TbClock />, iconClass: 'bg-primary-subtle' },
  publicado: { icon: <TbWorld />, iconClass: 'bg-success-subtle' },
};

type WidgetProps = {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  iconClass: string;
};

const Widget = ({ title, value, detail, icon, iconClass }: WidgetProps) => (
  <Card className="h-full">
    <div className="flex justify-between gap-2 relative">
      <div>
        <div className="mb-6 text-base">{title}</div>
        <p className="h3 mb-1 tabular-nums">{value}</p>
        <div className="inline-flex items-center flex-wrap gap-1">
          <span>{detail}</span>
        </div>
      </div>
      <div
        aria-hidden
        className={classNames(
          'flex items-center justify-center min-h-12 min-w-12 max-h-12 max-w-12 text-gray-900 dark:text-gray-100 rounded-full text-2xl',
          iconClass,
        )}
      >
        {icon}
      </div>
    </div>
  </Card>
);

export type SiteContentMetricsProps = {
  siteId: string;
  counts: ContentStatusCounts;
  /** Publicações de hoje (feitas e agendadas, dia de São Paulo) e o limite efetivo do dia. */
  publishedToday: number;
  dailyLimit: number;
  /** Com `content.write`, o atalho "Criar conteúdo". */
  canWrite: boolean;
};

/**
 * Cartões de conteúdo da Visão geral do site (#596): quantos conteúdos estão em cada etapa,
 * cada um levando à lista filtrada, as publicações de hoje e os atalhos para criar e revisar.
 */
export function SiteContentMetrics({
  siteId,
  counts,
  publishedToday,
  dailyLimit,
  canWrite,
}: SiteContentMetricsProps) {
  const base = `/sites/${siteId}`;
  return (
    <section aria-labelledby="site-content-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="site-content-title" className="h5">
          Conteúdos
        </h2>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`${base}/revisao`} size="sm" icon={<TbClipboardCheck aria-hidden />}>
            Revisar
          </ButtonLink>
          {canWrite && (
            <ButtonLink
              href={`${base}/conteudos/novo`}
              variant="solid"
              size="sm"
              icon={<TbPlus aria-hidden />}
            >
              Criar conteúdo
            </ButtonLink>
          )}
        </div>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARD_STATUSES.map((status) => (
          <li key={status}>
            <Link
              href={
                status === 'em_revisao' ? `${base}/revisao` : `${base}/conteudos?status=${status}`
              }
              className="block h-full rounded-2xl"
            >
              <Widget
                title={CONTENT_STATUS_LABEL[status]}
                value={formatCount(counts[status])}
                detail={status === 'em_revisao' ? 'Ver a fila de revisão' : 'Ver na lista'}
                {...STATUS_ICON[status]}
              />
            </Link>
          </li>
        ))}
        <li>
          <Widget
            title="Publicações hoje"
            value={formatCount(publishedToday)}
            detail={`de ${formatCount(dailyLimit)} por dia`}
            icon={<TbCalendarCheck />}
            iconClass="bg-success-subtle"
          />
        </li>
      </ul>
    </section>
  );
}
