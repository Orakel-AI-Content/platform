// Hora de parede no fuso do site (#317), para o calendário mostrar "hoje" e o dia selecionado no
// fuso do site, não no do navegador. Só `Intl`, sem plugin de fuso do dayjs, no padrão do
// `formatDateTime` (shared/siteLabels.ts) e do `ZonedDatetimeField` (forms/), que `ui/` não
// importa.
//
// A grade do calendário trabalha com `Date` locais cujos campos (`getFullYear`, `getDate`,
// `getHours`…) são a hora de parede: `toZonedDate` leva um instante para essa forma e
// `fromZonedDate` faz o caminho de volta.

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

/** Hora de parede do instante no fuso, como milissegundos de um relógio UTC. */
function wallAsUtc(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    partsFormat(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const ms = ((instant % 1000) + 1000) % 1000;
  return Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    ms,
  );
}

/** Instante → `Date` local com a hora de parede do fuso; sem fuso, o próprio instante. */
export function toZonedDate(date: Date, timeZone?: string): Date {
  if (!timeZone) return date;
  const wall = new Date(wallAsUtc(date.getTime(), timeZone));
  return new Date(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
    wall.getUTCMilliseconds(),
  );
}

/**
 * `Date` local com a hora de parede do fuso → instante. O offset é medido duas vezes porque o da
 * primeira estimativa pode ser o do outro lado de uma troca de horário de verão.
 */
export function fromZonedDate(date: Date, timeZone?: string): Date {
  if (!timeZone) return date;
  const wall = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
  const firstGuess = wall - (wallAsUtc(wall, timeZone) - wall);
  return new Date(wall - (wallAsUtc(firstGuess, timeZone) - firstGuess));
}
