// Ecme v1.3.10 (e5f9a1d): src/views/dashboards/AnalyticDashboard/components/Metrics.tsx
// Adaptado (#548):
// - só visualizações e sessões do período; sem `GrowShrinkValue` (sem comparação com o
//   período anterior), e a linha dele diz o período e, nas sessões, que são a soma dos dias;
// - número com `Intl.NumberFormat('pt-BR')` em vez do `NumericFormat` (sem dependência nova);
// - o valor é um `<p>` com a classe `.h3` (o Ecme usa `h3`): a tela não tem `h2`, e o número
//   não é título de seção;
// - círculo do ícone em `info-subtle`/`success-subtle` (o `orange-200`/`emerald-200` do Ecme
//   não está na paleta do Backoffice); o ícone é `aria-hidden`;
// - lado a lado a partir de `md` (o Ecme empilha em `2xl`, ao lado do gráfico que aqui não há).
import { TbEye, TbUsers } from 'react-icons/tb';
import type { ReactNode } from 'react';

import Card from '@/components/ui/Card';
import classNames from '@/components/ui/utils/classNames';
import type { AudiencePeriod } from '@/domain/audience/read.ts';

import { formatCount } from './format.ts';

type WidgetProps = {
  title: string;
  value: string | number | ReactNode;
  compareFrom: string;
  icon: ReactNode;
  iconClass: string;
};

type MetricsProps = {
  totals: { views: number; sessions: number };
  selectedPeriod: AudiencePeriod;
};

const Widget = ({ title, value, compareFrom, icon, iconClass }: WidgetProps) => {
  return (
    <Card className="flex-1">
      <div className="flex justify-between gap-2 relative">
        <div>
          <div className="mb-10 text-base">{title}</div>
          <p className="h3 mb-1 tabular-nums">{value}</p>
          <div className="inline-flex items-center flex-wrap gap-1">
            <span>{compareFrom}</span>
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
};

const AudienceMetrics = ({ totals, selectedPeriod }: MetricsProps) => {
  const period = `Últimos ${selectedPeriod} dias`;
  return (
    <div className="flex flex-col md:flex-row gap-4">
      <Widget
        title="Visualizações"
        value={formatCount(totals.views)}
        compareFrom={period}
        icon={<TbEye />}
        iconClass="bg-info-subtle"
      />
      <Widget
        title="Sessões"
        value={formatCount(totals.sessions)}
        compareFrom={`${period}, soma dos dias`}
        icon={<TbUsers />}
        iconClass="bg-success-subtle"
      />
    </div>
  );
};

export default AudienceMetrics;
