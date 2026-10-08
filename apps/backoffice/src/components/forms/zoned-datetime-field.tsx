'use client';

import { Input } from '@/components/ui/input';

import type { FieldProps, FieldRenderer } from './schema-form.tsx';

// Data e hora no fuso do site (#183): o seletor `datetime-local` mostra e recebe a hora de
// parede do site, e o valor gravado é ISO com o offset do fuso naquele instante (horário de
// verão incluído), o formato de `IsoDateTimeSchema`. Só `Intl`, sem biblioteca de datas, no
// padrão do `formatDateTime` (site-labels.ts).

const formats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(timeZone: string): Intl.DateTimeFormat {
  let format = formats.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formats.set(timeZone, format);
  }
  return format;
}

type Wall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Hora de parede do instante no fuso. */
function wallAt(instant: number, timeZone: string): Wall {
  const parts = Object.fromEntries(
    partsFormat(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

const asUtc = (wall: Wall) =>
  Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);

/** Offset do fuso no instante, em minutos (Lisboa no verão: 60). */
function offsetAt(instant: number, timeZone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;
  return Math.round((asUtc(wallAt(whole, timeZone)) - whole) / 60_000);
}

const pad = (value: number, size = 2) => String(Math.abs(value)).padStart(size, '0');

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** ISO (qualquer offset) → `YYYY-MM-DDTHH:mm` no fuso; vazio se não for data válida. */
export function isoToLocal(iso: string, timeZone: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return '';
  const wall = wallAt(instant, timeZone);
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

/**
 * `YYYY-MM-DDTHH:mm` no fuso → `YYYY-MM-DDTHH:mm:00±HH:MM`, com o offset do fuso naquela hora.
 * Na troca de horário: hora repetida (atraso) usa o primeiro offset; hora inexistente
 * (adiantamento) usa o offset depois da troca. `undefined` se o texto não for uma data.
 */
export function localToIso(local: string, timeZone: string): string | undefined {
  const match = LOCAL.exec(local);
  if (match === null) return undefined;
  const [, year, month, day, hour, minute] = match.map(Number);
  const wall = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  // Os offsets possíveis são o de antes e o de depois de uma eventual troca (12 h de folga).
  const before = offsetAt(wall - 12 * 3_600_000, timeZone);
  const after = offsetAt(wall + 12 * 3_600_000, timeZone);
  const fits = [...new Set([before, after])].filter(
    (offset) => offsetAt(wall - offset * 60_000, timeZone) === offset,
  );
  // Duas que servem: hora repetida, vale a primeira (o offset de antes). Nenhuma: hora
  // inexistente, vale o offset de depois.
  const offset = fits.length === 0 ? after : fits.includes(before) ? before : (fits[0] ?? after);
  return `${local}:00${formatOffset(offset)}`;
}

/** Campo de data e hora no fuso do site, para o gerador (`fields`). */
export function zonedDateTimeField(timeZone: string): FieldRenderer {
  function ZonedDateTimeField({
    id,
    value,
    onChange,
    invalid,
    describedBy,
    ref,
    readOnly,
  }: FieldProps) {
    return (
      <Input
        id={id}
        ref={ref}
        type="datetime-local"
        readOnly={readOnly}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={typeof value === 'string' ? isoToLocal(value, timeZone) : ''}
        onChange={(event) => onChange(localToIso(event.target.value, timeZone))}
      />
    );
  }
  return ZonedDateTimeField;
}
