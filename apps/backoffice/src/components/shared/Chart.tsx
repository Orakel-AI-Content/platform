'use client';

// Ecme v1.3.10 (e5f9a1d): src/components/shared/Chart.tsx e src/configs/chart.config.ts
// Adaptado (#599):
// - só o tipo `line` (o único que o Backoffice usa), com o `apexLineChartDefaultOption` do
//   `chart.config` aqui; sem donut, radar, área, barra e sem RTL;
// - o Ecme lê `window.innerWidth` durante a renderização para posicionar a legenda no celular, o
//   que quebra no SSR (docs/migration/ecme.md): a leitura vai para o `useEffect`, por
//   `matchMedia`, e a legenda só é ajustada se existir;
// - sem o `tooltipHoverFormatter` da legenda: quem usa mostra a legenda em texto fora do SVG,
//   como o `AnalyticChart` do template;
// - as opções padrão são copiadas com `structuredClone` em vez de `JSON.parse(JSON.stringify())`,
//   e as categorias entram depois de `customOptions`, para um `xaxis` próprio (rótulos) não
//   apagá-las.
//
// O `react-apexcharts` lê `window` ao ser importado: carregue este componente só no navegador,
// com `next/dynamic` e `ssr: false` (como `AudienceChart`), nunca por import estático numa tela.
import { useEffect, useRef } from 'react';
import ApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

export const apexLineChartDefaultOption: ApexOptions = {
  chart: {
    zoom: {
      enabled: false,
    },
    toolbar: {
      show: false,
    },
  },
  dataLabels: {
    enabled: false,
  },
  stroke: {
    width: 2.5,
    curve: 'smooth',
    lineCap: 'round',
  },
  legend: {
    itemMargin: {
      vertical: 10,
    },
  },
  xaxis: {
    categories: [],
  },
};

export interface ChartProps {
  series?: ApexOptions['series'];
  width?: string | number;
  height?: string | number;
  xAxis?: NonNullable<ApexOptions['xaxis']>['categories'];
  customOptions?: ApexOptions;
  className?: string;
}

const MOBILE = '(max-width: 767px)';

const Chart = (props: ChartProps) => {
  const { series = [], width = '100%', height = 300, xAxis, customOptions, className } = props;

  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia(MOBILE).matches) return;
    const legend = chartRef.current?.querySelector<HTMLDivElement>('div.apexcharts-legend');
    if (!legend) return;
    legend.style.position = 'relative';
    legend.style.top = '0';
    legend.style.justifyContent = 'start';
    legend.style.padding = '0';
  }, []);

  let options = structuredClone(apexLineChartDefaultOption);

  if (customOptions) {
    options = { ...options, ...customOptions };
  }

  options.xaxis = { ...options.xaxis, categories: xAxis };

  return (
    <div ref={chartRef} className="chartRef">
      <ApexChart
        options={options}
        type="line"
        series={series}
        width={width}
        height={height}
        className={className}
      />
    </div>
  );
};

export default Chart;
