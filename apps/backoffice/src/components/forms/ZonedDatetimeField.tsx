'use client';

import { useMemo } from 'react';

import { DateTimepicker } from '@/components/ui/DatePicker';
import { toZonedDate } from '@/components/ui/DatePicker/utils';

import type { FieldProps, FieldRenderer } from './SchemaForm.tsx';

// Data e hora no fuso do site (#183): o `DateTimepicker` do Ecme (#331) mostra e recebe a hora de
// parede do site (prop `timeZone`), e o valor gravado é ISO com o offset do fuso naquele instante
// (horário de verão incluído), no minuto cheio, o formato de `IsoDateTimeSchema`. O cálculo de
// fuso é o de `ui/DatePicker/utils/zonedDate.ts` (só `Intl`); na troca de horário vale a regra
// do seletor (`fromZonedDate`): hora repetida, a primeira ocorrência; hora inexistente, avança
// pelo tamanho do salto.

const pad = (value: number, size = 2) => String(Math.abs(value)).padStart(size, '0');

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

/** ISO (qualquer offset) → instante; `null` se não for data válida. */
export function isoToDate(iso: unknown): Date | null {
  if (typeof iso !== 'string') return null;
  const instant = Date.parse(iso);
  return Number.isNaN(instant) ? null : new Date(instant);
}

/**
 * Instante → `YYYY-MM-DDTHH:mm:00±HH:MM`: a hora de parede no fuso, no minuto, com o offset do
 * fuso naquele instante. `undefined` sem data (campo limpo).
 */
export function dateToIso(date: Date | null, timeZone: string): string | undefined {
  if (date === null || Number.isNaN(date.getTime())) return undefined;
  const wall = toZonedDate(date, timeZone);
  const wallAsUtc = Date.UTC(
    wall.getFullYear(),
    wall.getMonth(),
    wall.getDate(),
    wall.getHours(),
    wall.getMinutes(),
    wall.getSeconds(),
    wall.getMilliseconds(),
  );
  const offset = Math.round((wallAsUtc - date.getTime()) / 60_000);
  const day = `${pad(wall.getFullYear(), 4)}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}`;
  return `${day}T${pad(wall.getHours())}:${pad(wall.getMinutes())}:00${formatOffset(offset)}`;
}

/** Campo de data e hora no fuso do site, para o gerador (`fields`). */
export function zonedDateTimeField(timeZone: string): FieldRenderer {
  function ZonedDateTimeRenderer(props: FieldProps) {
    return <ZonedDateTimeField {...props} timeZone={timeZone} />;
  }
  return ZonedDateTimeRenderer;
}

// O renderizador é chamado como função; o `Date` do valor fica estável num componente de
// verdade (o seletor compara a prop `value` por referência a cada render).
function ZonedDateTimeField({
  name,
  value,
  onChange,
  required,
  ref,
  readOnly,
  timeZone,
}: FieldProps & { timeZone: string }) {
  const iso = typeof value === 'string' ? value : undefined;
  const date = useMemo(() => isoToDate(iso), [iso]);
  return (
    <DateTimepicker
      // O id, a dica, o erro e `aria-invalid` vêm do `FormItem` (o `Input` do seletor os lê).
      ref={ref}
      name={name}
      timeZone={timeZone}
      value={date}
      disabled={readOnly}
      aria-required={required || undefined}
      onChange={(next) => onChange(dateToIso(next, timeZone))}
    />
  );
}
