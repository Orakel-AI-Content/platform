'use client';

// Ecme v1.3.10 (e5f9a1d): src/views/dashboards/AnalyticDashboard/components/AnalyticChart.tsx
// Adaptado (#599):
// - só as duas séries do domínio (visualizações e sessões por dia), sem os totais com
//   `GrowShrinkValue` (estão nos cartões de `AudienceMetrics`) nem o reajuste ao recolher a
//   barra lateral (o ApexCharts já acompanha o tamanho do contêiner);
// - o `Chart` vem por `next/dynamic` com `ssr: false`: o `react-apexcharts` lê `window` ao ser
//   importado, e assim ele fica num chunk só desta tela; no servidor sai um espaço da mesma
//   altura, sem diferença na hidratação;
// - título em `h2` (a tela não tem outro `h2`; o Ecme usa `h4`);
// - cores `primary` e `success` do Backoffice no lugar do `COLORS` do template (contraste nos
//   dois temas, em globals-contrast.test.ts), e cada série com marcador e traço próprios, para
//   não depender só da cor (1.4.1); a legenda em texto repete marcador e traço;
// - nome acessível com o período e a navegação por teclado do ApexCharts (setas mostram o valor
//   do dia na dica); a tabela abaixo continua sendo a alternativa em texto.
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

import Card from '@/components/ui/Card';
import type { AudienceDay, AudiencePeriod } from '@/domain/audience/read.ts';

import { formatAudienceDay, formatAudienceShortDay, formatCount } from './format.ts';

const HEIGHT = 300;

const Chart = dynamic(() => import('@/components/shared/Chart'), {
  ssr: false,
  loading: () => <div style={{ height: HEIGHT }} />,
});

type Serie = {
  name: string;
  key: 'views' | 'sessions';
  color: string;
  dash: number;
  shape: 'circle' | 'square';
};

const SERIES: readonly Serie[] = [
  { name: 'Visualizações', key: 'views', color: 'var(--primary)', dash: 0, shape: 'circle' },
  { name: 'Sessões', key: 'sessions', color: 'var(--success)', dash: 6, shape: 'square' },
];

/**
 * Dias em ordem cronológica (o domínio entrega o mais recente primeiro) e o nome do gráfico com
 * o período, para o leitor de tela.
 */
export function audienceChartData(days: readonly AudienceDay[], period: AudiencePeriod) {
  const ordered = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const first = ordered[0];
  const last = ordered.at(-1);
  const range =
    first && last ? `, de ${formatAudienceDay(first.day)} a ${formatAudienceDay(last.day)}` : '';
  return {
    categories: ordered.map((row) => row.day),
    series: SERIES.map((serie) => ({
      name: serie.name,
      data: ordered.map((row) => row[serie.key]),
    })),
    label: `Visualizações e sessões por dia nos últimos ${period} dias${range}. Os valores estão na tabela abaixo.`,
  };
}

function LegendMark({ serie }: { serie: Serie }) {
  return (
    <svg aria-hidden width="28" height="12" viewBox="0 0 28 12" style={{ color: serie.color }}>
      <line
        x1="1"
        y1="6"
        x2="27"
        y2="6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={serie.dash ? '4 4' : undefined}
      />
      {serie.shape === 'circle' ? (
        <circle cx="14" cy="6" r="4" fill="currentColor" />
      ) : (
        <rect x="10" y="2" width="8" height="8" fill="currentColor" />
      )}
    </svg>
  );
}

type AudienceChartProps = {
  days: readonly AudienceDay[];
  selectedPeriod: AudiencePeriod;
};

const AudienceChart = ({ days, selectedPeriod }: AudienceChartProps) => {
  const { categories, series, label } = audienceChartData(days, selectedPeriod);

  const options: ApexOptions = {
    chart: {
      zoom: { enabled: false },
      toolbar: { show: false },
      fontFamily: 'inherit',
      accessibility: { enabled: true, description: label },
    },
    colors: SERIES.map((serie) => serie.color),
    stroke: {
      width: 2.5,
      curve: 'smooth',
      lineCap: 'round',
      dashArray: SERIES.map((serie) => serie.dash),
    },
    markers: {
      size: 4,
      strokeWidth: 0,
      shape: SERIES.map((serie) => serie.shape),
      hover: { sizeOffset: 2 },
    },
    legend: { show: false },
    xaxis: {
      labels: { formatter: (value: string) => (value ? formatAudienceShortDay(value) : '') },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: { formatter: (value: number) => formatCount(Math.round(value)) },
    },
    tooltip: {
      shared: true,
      intersect: false,
      x: { formatter: (_value: number, opts) => formatTooltipDay(categories, opts) },
      y: { formatter: (value: number) => formatCount(value) },
    },
  };

  return (
    <Card>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="h4">Visualizações e sessões por dia</h2>
        <ul className="inline-flex flex-wrap items-center gap-6" aria-label="Legenda">
          {SERIES.map((serie) => (
            <li key={serie.key} className="flex items-center gap-1.5">
              <LegendMark serie={serie} />
              <span>{serie.name}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4">
        <Chart series={series} xAxis={categories} customOptions={options} height={HEIGHT} />
      </div>
    </Card>
  );
};

/** O dia da dica pelo índice do ponto: o valor que o ApexCharts passa já vem do eixo. */
function formatTooltipDay(categories: readonly string[], opts: unknown): string {
  const index = (opts as { dataPointIndex?: number } | undefined)?.dataPointIndex ?? -1;
  const day = categories[index];
  return day ? formatAudienceDay(day) : '';
}

export default AudienceChart;
