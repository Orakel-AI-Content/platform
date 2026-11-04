// Ecme v1.3.10 (e5f9a1d): src/views/dashboards/AnalyticDashboard/components/AnalyticHeader.tsx
// Adaptado (#548):
// - o período vai para a URL (`?periodo=`, sem ele para 7 dias), e o Server Component lê de
//   novo: o endereço fica compartilhável e a leitura toda no servidor. Trocar o período volta
//   a tabela à primeira página;
// - o título é o `h1` da tela (o Ecme usa `h4`), ligado à tela por `titleId`;
// - "Show by:" vira o `<label>` do Select (`inputId`), em vez de um `span` solto;
// - textos em pt-BR e só os períodos de 7 e 30 dias.
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import Select from '@/components/ui/Select';
import type { AudiencePeriod } from '@/domain/audience/read.ts';

type PeriodOption = { value: AudiencePeriod; label: string };

export const options: PeriodOption[] = [
  { value: 7, label: 'Últimos 7 dias' },
  { value: 30, label: 'Últimos 30 dias' },
];

export const PERIOD_PARAM = 'periodo';

type AudienceHeaderProps = {
  titleId: string;
  selectedPeriod: AudiencePeriod;
};

const AudienceHeader = ({ titleId, selectedPeriod }: AudienceHeaderProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onSelectedPeriodChange = (value: AudiencePeriod) => {
    const next = new URLSearchParams(params);
    if (value === 7) next.delete(PERIOD_PARAM);
    else next.set(PERIOD_PARAM, String(value));
    next.delete('pagina');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 gap-4">
      <div>
        <h1 id={titleId} className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
          Audiência
        </h1>
        <p>Visualizações e sessões por dia (horário de São Paulo).</p>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="audience-period">Período:</label>
        <Select<PeriodOption>
          inputId="audience-period"
          instanceId="audience-period"
          className="w-[170px]"
          size="sm"
          value={options.filter((option) => option.value === selectedPeriod)}
          options={options}
          isSearchable={false}
          onChange={(option) => {
            if (option?.value) {
              onSelectedPeriodChange(option.value);
            }
          }}
        />
      </div>
    </div>
  );
};

export default AudienceHeader;
