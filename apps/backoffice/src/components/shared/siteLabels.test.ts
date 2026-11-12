import { describe, expect, it } from 'vitest';

import { BUILD_KINDS, BUILD_STAGES, SITE_EVENT_KINDS } from '@/db/schema/operations.ts';
import type { ExecutionHistoryItem, OpenExecution } from '@/domain/builds/builds.ts';

import {
  BUILD_STAGE_LABEL,
  BUILD_STATUS_LABEL,
  HISTORY_KIND_LABEL,
  BUILD_STATUS_VARIANT,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  INFRA_STEP_TEXT,
  LIFECYCLE_LABEL,
  LIFECYCLE_ORDER,
  PUBLICATION_STEPS,
  PUBLICATION_STEP_LABEL,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
  formatDateTime,
  formatDuration,
  liveResultText,
  liveStatusText,
  liveVersionText,
} from './siteLabels.ts';

// Cada estado tem aparência própria dentro do seu grupo (#86): a variante não se repete e
// todo estado tem rótulo, porque o texto é o que distingue os estados sem cor.

const groups = [
  ['status de conteúdo', CONTENT_STATUS_LABEL, CONTENT_STATUS_TAG],
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

describe('histórico do site (#637)', () => {
  it('tem rótulo para cada tipo de execução e de evento, sem repetir', () => {
    expect(Object.keys(HISTORY_KIND_LABEL).sort()).toEqual(
      [...BUILD_KINDS, ...SITE_EVENT_KINDS].sort(),
    );
    const labels = Object.values(HISTORY_KIND_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('tem rótulo para cada etapa do build', () => {
    expect(Object.keys(BUILD_STAGE_LABEL).sort()).toEqual([...BUILD_STAGES].sort());
    for (const label of Object.values(BUILD_STAGE_LABEL)) expect(label).not.toBe('');
  });
});

describe('faixa de status ao vivo (#638)', () => {
  const open: OpenExecution = {
    id: 7,
    kind: 'build',
    status: 'na_fila',
    currentStage: null,
    scheduledFor: new Date('2026-10-01T12:00:00Z'),
    startedAt: null,
    requestedBy: 'system',
    cancelRequestedAt: null,
  };

  it('na fila, com o horário previsto no fuso do site', () => {
    expect(liveStatusText(open, 'America/Sao_Paulo')).toBe(
      'Publicação na fila, prevista para 01/10/2026, 09:00 BRT',
    );
    expect(liveStatusText({ ...open, scheduledFor: null }, 'UTC')).toBe('Publicação na fila');
  });

  it('em andamento, com a etapa quando já há uma', () => {
    const running = { ...open, status: 'rodando' as const, scheduledFor: null };
    expect(liveStatusText(running, 'UTC')).toBe('Publicação em andamento');
    expect(liveStatusText({ ...running, currentStage: 'render', kind: 'rollback' }, 'UTC')).toBe(
      'Reversão em andamento, etapa: Renderização',
    );
  });

  it('o resultado da execução que terminou', () => {
    const item: ExecutionHistoryItem = {
      type: 'execucao',
      id: 7,
      kind: 'build',
      status: 'failed',
      requestedBy: 'system',
      cancelRequestedBy: null,
      at: new Date('2026-10-01T12:00:00Z'),
      release: '1.3.0',
      versionId: null,
      failure: null,
    };
    expect(liveResultText(item, 'UTC')).toBe('Publicação falhou em 01/10/2026, 12:00 UTC');
    expect(liveResultText({ ...item, status: 'ok' }, 'UTC')).toBe(
      'Publicação concluída em 01/10/2026, 12:00 UTC',
    );
    expect(liveResultText({ ...item, status: 'cancelado' }, 'UTC')).toBe(
      'Publicação cancelada em 01/10/2026, 12:00 UTC',
    );
  });
});

describe('ordem do ciclo de vida (#148)', () => {
  it('tem cada etapa com rótulo exatamente uma vez', () => {
    expect(new Set(LIFECYCLE_ORDER).size).toBe(LIFECYCLE_ORDER.length);
    expect([...LIFECYCLE_ORDER].sort()).toEqual(Object.keys(LIFECYCLE_LABEL).sort());
  });
});

describe('painel de etapas da aba Publicação (#647)', () => {
  it('tem cada etapa com rótulo exatamente uma vez, na ordem do painel', () => {
    expect(PUBLICATION_STEPS.map((step) => PUBLICATION_STEP_LABEL[step])).toEqual([
      'Infra e zona',
      'Versão',
      'Build',
      'No ar',
      'Site',
    ]);
    expect(Object.keys(INFRA_STEP_TEXT).sort()).toEqual([...LIFECYCLE_ORDER].sort());
  });

  it('a versão no ar com páginas, quando e por quem', () => {
    const since = { at: new Date('2026-10-01T12:00:00Z'), by: 'ana@orakel.local' };
    expect(liveVersionText('v41', 120, since, 'America/Sao_Paulo')).toBe(
      'v41 · 120 páginas · no ar desde 01/10/2026, 09:00 BRT, por ana@orakel.local',
    );
    expect(liveVersionText('v41', 1, { ...since, by: null }, 'UTC')).toBe(
      'v41 · 1 página · no ar desde 01/10/2026, 12:00 UTC',
    );
    expect(liveVersionText('v41', null, null, 'UTC')).toBe('v41');
  });
});
