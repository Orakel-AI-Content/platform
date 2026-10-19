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

/** Offset do fuso no instante, em milissegundos (hora de parede − UTC). */
function offsetAt(instant: number, timeZone: string): number {
  return wallAsUtc(instant, timeZone) - instant;
}

const HALF_DAY = 12 * 3_600_000;

/**
 * `Date` local com a hora de parede do fuso → instante. Na troca de horário (#318), a regra
 * `compatible` do Temporal: hora repetida (atraso) vale a primeira ocorrência, o offset de antes,
 * como o `localToIso` do `ZonedDatetimeField` grava; hora inexistente (adiantamento) avança pelo
 * tamanho do salto (01:30 de Lisboa no fim de março vira 02:30 de verão).
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
  // Os offsets possíveis são o de antes e o de depois de uma eventual troca (12 h de folga).
  const before = offsetAt(wall - HALF_DAY, timeZone);
  const after = offsetAt(wall + HALF_DAY, timeZone);
  const fits = [before, after].filter((offset) => offsetAt(wall - offset, timeZone) === offset);
  // Nenhum serve: hora inexistente, lida com o offset de antes, cai depois do salto.
  return new Date(wall - (fits[0] ?? before));
}
