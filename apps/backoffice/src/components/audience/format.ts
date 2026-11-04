// Formatação da audiência (#548), sem dependência nova: números e dias em pt-BR.

const number = new Intl.NumberFormat('pt-BR');

/** "1.250". */
export function formatCount(value: number): string {
  return number.format(value);
}

// O dia já é o de São Paulo (`AAAA-MM-DD`): formatado em UTC para não andar de fuso.
const dayFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `2026-11-04` → "qua., 04/11/2026". */
export function formatAudienceDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}
