import { describe, expect, it } from 'vitest';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  CONTENT_STATUS_VARIANT,
  LIFECYCLE_LABEL,
  LIFECYCLE_ORDER,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
  formatDateTime,
  formatDuration,
} from './site-labels.ts';

// Cada estado tem aparência própria dentro do seu grupo (#86): a variante não se repete e
// todo estado tem rótulo, porque o texto é o que distingue os estados sem cor.

const groups = [
  ['status de conteúdo', CONTENT_STATUS_LABEL, CONTENT_STATUS_VARIANT],
  ['status de conteúdo na tag', CONTENT_STATUS_LABEL, CONTENT_STATUS_TAG],
  ['estado de site', SITE_STATE_LABEL, SITE_STATE_VARIANT],
  ['resultado de build', BUILD_STATUS_LABEL, BUILD_STATUS_VARIANT],
] as const;

describe.each(groups)('%s', (_, labels, variants) => {
  it('não repete variante entre dois estados', () => {
    const used = Object.values(variants);
    expect(new Set(used).size).toBe(used.length);
  });

  it('tem rótulo e variante para os mesmos estados', () => {
    expect(Object.keys(variants).sort()).toEqual(Object.keys(labels).sort());
    for (const label of Object.values(labels)) expect(label).not.toBe('');
  });
});

describe('data e hora no fuso do site (#90)', () => {
  const instant = new Date('2026-10-01T12:00:00Z');

  it('mostra o mesmo instante no horário de cada fuso, com a indicação do fuso', () => {
    expect(formatDateTime(instant, 'America/Sao_Paulo')).toBe('01/10/2026, 09:00 BRT');
    expect(formatDateTime(instant, 'Europe/Lisbon')).toBe('01/10/2026, 13:00 GMT+1');
  });

  it('reaproveita o formatador do fuso sem misturar fusos', () => {
    expect(formatDateTime(instant, 'Europe/Lisbon')).toBe(formatDateTime(instant, 'Europe/Lisbon'));
    expect(formatDateTime(instant, 'UTC')).toBe('01/10/2026, 12:00 UTC');
  });
});

describe('duração da janela de agrupamento (#147)', () => {
  it('fica só em segundos abaixo de 1 min', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(45)).toBe('45 s');
  });

  it('acrescenta minutos e horas, sem componentes zerados', () => {
    expect(formatDuration(60)).toBe('60 s (1 min)');
    expect(formatDuration(300)).toBe('300 s (5 min)');
    expect(formatDuration(3600)).toBe('3600 s (1 h)');
    expect(formatDuration(5400)).toBe('5400 s (1 h 30 min)');
  });

  it('combina horas, minutos e segundos', () => {
    expect(formatDuration(90)).toBe('90 s (1 min 30 s)');
    expect(formatDuration(3661)).toBe('3661 s (1 h 1 min 1 s)');
    expect(formatDuration(3605)).toBe('3605 s (1 h 5 s)');
  });
});

describe('ordem do ciclo de vida (#148)', () => {
  it('tem cada etapa com rótulo exatamente uma vez', () => {
    expect(new Set(LIFECYCLE_ORDER).size).toBe(LIFECYCLE_ORDER.length);
    expect([...LIFECYCLE_ORDER].sort()).toEqual(Object.keys(LIFECYCLE_LABEL).sort());
  });
});
