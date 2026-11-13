import { describe, expect, it } from 'vitest';

import {
  BUILD_KINDS,
  BUILD_STAGES,
  INFRA_RESOURCE_STEPS,
  SITE_EVENT_KINDS,
} from '@/db/schema/operations.ts';
import type {
  EventHistoryItem,
  ExecutionHistoryItem,
  OpenExecution,
} from '@/domain/builds/builds.ts';
import type { InfraHistoryItem } from '@/domain/infra/runs.ts';

import {
  BUILD_STAGE_LABEL,
  BUILD_STATUS_LABEL,
  HISTORY_KIND_LABEL,
  historyItemTitle,
  BUILD_STATUS_VARIANT,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  INFRA_STEP_LABEL,
  INFRA_STEP_ORDER,
  INFRA_STEP_TEXT,
  LIFECYCLE_LABEL,
  LIFECYCLE_ORDER,
  PUBLICATION_STEPS,
  PUBLICATION_STEP_LABEL,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
  agoText,
  formatDateTime,
  formatDuration,
  infraCheckText,
  infraFailureText,
  infraLiveResultText,
  infraLiveStatusText,
  infraStepChangesText,
  infraRemovalPagesText,
  latestInfraCreation,
  latestInfraRemoval,
  latestInfraRun,
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

describe('título do item da linha do tempo (#651)', () => {
  const run = (over: Partial<ExecutionHistoryItem>): ExecutionHistoryItem => ({
    type: 'execucao',
    id: 1,
    kind: 'build',
    status: 'ok',
    requestedBy: 'system',
    cancelRequestedBy: null,
    at: new Date('2026-10-11T17:00:00Z'),
    release: '1.3.0',
    versionId: null,
    failure: null,
    ...over,
  });
  const event = (over: Partial<EventHistoryItem>): EventHistoryItem => ({
    type: 'evento',
    id: 1,
    kind: 'retomada',
    requestedBy: 'ana@orakel.local',
    at: new Date('2026-10-11T17:00:00Z'),
    reason: null,
    previousRelease: null,
    release: null,
    ...over,
  });

  it('a execução concluída leva só o tipo', () => {
    expect(historyItemTitle(run({}))).toBe('Publicação');
    expect(historyItemTitle(run({ kind: 'rollback' }))).toBe('Reversão');
  });

  it('o cancelamento e a falha dizem o resultado, a falha com a etapa quando há uma', () => {
    expect(historyItemTitle(run({ status: 'cancelado' }))).toBe('Publicação cancelada');
    const failure = { stage: 'render', kind: 'permanent', message: null, logTail: null } as const;
    expect(historyItemTitle(run({ status: 'failed', failure }))).toBe(
      'Publicação · falhou na etapa Renderização',
    );
    expect(
      historyItemTitle(
        run({ kind: 'rollback', status: 'failed', failure: { ...failure, stage: null } }),
      ),
    ).toBe('Reversão · falhou');
  });

  it('a pausa leva o motivo; os outros eventos, só o tipo', () => {
    expect(historyItemTitle(event({ kind: 'pausa', reason: 'migração de domínio' }))).toBe(
      'Pausa: migração de domínio',
    );
    expect(historyItemTitle(event({ kind: 'pausa' }))).toBe('Pausa');
    expect(historyItemTitle(event({}))).toBe('Retomada');
    expect(historyItemTitle(event({ kind: 'troca_de_versao' }))).toBe('Troca de versão');
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

describe('conferência da infra na etapa Infra e zona (#716)', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);

  it('quanto tempo passou, em minutos, horas e dias', () => {
    expect(agoText(now, now)).toBe('há menos de 1 minuto');
    expect(agoText(new Date(now.getTime() + 5000), now)).toBe('há menos de 1 minuto');
    expect(agoText(minutesAgo(1), now)).toBe('há 1 minuto');
    expect(agoText(minutesAgo(59), now)).toBe('há 59 minutos');
    expect(agoText(minutesAgo(60), now)).toBe('há 1 hora');
    expect(agoText(minutesAgo(5 * 60), now)).toBe('há 5 horas');
    expect(agoText(minutesAgo(24 * 60), now)).toBe('há 1 dia');
    expect(agoText(minutesAgo(3 * 24 * 60), now)).toBe('há 3 dias');
  });

  const base = { checkedAt: minutesAgo(5), error: null, queued: false };

  it('na fila, "Conferindo…", mesmo com conferência anterior', () => {
    expect(infraCheckText({ ...base, lifecycle: 'cadastrado', queued: true }, now)).toBe(
      'Conferindo…',
    );
  });

  it('nunca conferido: "Ainda não conferido" só onde a conferência ainda avança', () => {
    const never = { ...base, checkedAt: null };
    expect(infraCheckText({ ...never, lifecycle: 'cadastrado' }, now)).toBe('Ainda não conferido');
    expect(infraCheckText({ ...never, lifecycle: 'infra_aplicada' }, now)).toBe(
      'Ainda não conferido',
    );
    expect(infraCheckText({ ...never, lifecycle: 'zona_ativa' }, now)).toBeNull();
    expect(infraCheckText({ ...never, lifecycle: 'publicado' }, now)).toBeNull();
  });

  it('o que foi detectado, com o motivo de não ter avançado e quando', () => {
    expect(infraCheckText({ ...base, lifecycle: 'cadastrado' }, now)).toBe(
      'Zona não encontrada no provedor (conferido há 5 minutos)',
    );
    expect(infraCheckText({ ...base, lifecycle: 'infra_aplicada' }, now)).toBe(
      'Infra detectada sozinha, zona ainda pendente no provedor (conferido há 5 minutos)',
    );
    expect(infraCheckText({ ...base, lifecycle: 'zona_ativa' }, now)).toBe(
      'Detectado sozinho (conferido há 5 minutos)',
    );
  });

  it('falha do provedor com a mensagem, sem texto de etapa pendente', () => {
    expect(
      infraCheckText({ ...base, lifecycle: 'cadastrado', error: 'Cloudflare respondeu 503' }, now),
    ).toBe(
      'Não foi possível consultar o provedor (conferido há 5 minutos): Cloudflare respondeu 503',
    );
  });
});

describe('resumo do plano da infra (#825)', () => {
  it('as etapas seguem a ordem de INFRA_RESOURCE_STEPS, todas com rótulo', () => {
    expect(INFRA_STEP_ORDER).toEqual([...INFRA_RESOURCE_STEPS]);
    for (const step of INFRA_RESOURCE_STEPS) expect(INFRA_STEP_LABEL[step]).not.toBe('');
  });

  const change = (action: 'create' | 'update' | 'delete' | 'replace') => ({
    address: `module.site.x.${action}`,
    type: 'cloudflare_dns_record',
    action,
  });

  it('sem recursos, nada muda', () => {
    expect(infraStepChangesText([])).toBe('Nada muda');
  });

  it('conta os recursos por ação, na ordem criar, alterar, recriar, remover', () => {
    expect(
      infraStepChangesText([
        change('delete'),
        change('create'),
        change('update'),
        change('create'),
        change('replace'),
      ]),
    ).toBe('2 a criar · 1 a alterar · 1 a recriar · 1 a remover');
  });
});

describe('infraRemovalPagesText', () => {
  it('conta as páginas no ar, ou diz que nada está no ar', () => {
    expect(infraRemovalPagesText(12)).toBe('12 a remover');
    expect(infraRemovalPagesText(0)).toBe('Nada no ar');
    expect(infraRemovalPagesText(null)).toBe('Nada no ar');
  });
});

describe('andamento e histórico da criação da infra (#826)', () => {
  const run = (over: Partial<InfraHistoryItem>): InfraHistoryItem => ({
    type: 'infra',
    id: 3,
    kind: 'criar',
    status: 'ok',
    requestedBy: 'operacao@orakel.local',
    requestedAt: new Date('2026-10-01T11:58:00Z'),
    confirmedBy: 'operacao@orakel.local',
    at: new Date('2026-10-01T12:00:00Z'),
    nameservers: ['ada.ns.example', 'bob.ns.example'],
    failure: null,
    ...over,
  });
  const failed = run({
    status: 'falhou',
    nameservers: null,
    failure: { step: 'regras', message: 'Falha simulada' },
  });

  it('a faixa da criação aplicando diz a etapa corrente, quando já há uma', () => {
    expect(infraLiveStatusText({ kind: 'criar', currentStep: null })).toBe(
      'Criação da infraestrutura em andamento',
    );
    expect(infraLiveStatusText({ kind: 'criar', currentStep: 'dns' })).toBe(
      'Criação da infraestrutura em andamento, etapa: Registros de DNS',
    );
  });

  it('o resultado: concluída, ou a etapa e o motivo da falha', () => {
    expect(infraLiveResultText(run({}), 'UTC')).toBe(
      'Criação da infraestrutura concluída em 01/10/2026, 12:00 UTC',
    );
    expect(infraLiveResultText(failed, 'UTC')).toBe(
      'Criação da infraestrutura falhou na etapa Regras em 01/10/2026, 12:00 UTC: Falha simulada',
    );
    expect(
      infraLiveResultText(run({ status: 'falhou', failure: { step: null, message: null } }), 'UTC'),
    ).toBe('Criação da infraestrutura falhou em 01/10/2026, 12:00 UTC');
  });

  it('no histórico, o título leva a etapa da falha e o detalhe, o motivo', () => {
    expect(historyItemTitle(run({}))).toBe('Criação da infraestrutura');
    expect(historyItemTitle(failed)).toBe('Criação da infraestrutura · falhou na etapa Regras');
    expect(infraFailureText({ step: 'regras', message: 'Falha simulada' })).toBe(
      'falhou na etapa Regras: Falha simulada',
    );
    expect(infraFailureText({ step: null, message: null })).toBe('falhou');
  });

  it('a criação mais recente ignora remoções e outros itens', () => {
    const removal = run({ id: 9, kind: 'remover', nameservers: null });
    expect(latestInfraCreation([removal, failed, run({ id: 1 })])).toBe(failed);
    expect(latestInfraCreation([removal])).toBeUndefined();
  });

  it('a execução mais recente de um tipo ignora as de outro tipo', () => {
    const reapply = run({ id: 9, kind: 'reaplicar', nameservers: null });
    expect(latestInfraRun([failed, reapply, run({ id: 1, kind: 'reaplicar' })], 'reaplicar')).toBe(
      reapply,
    );
    expect(latestInfraRun([failed], 'reaplicar')).toBeUndefined();
  });

  it('remoção e reaplicação levam o próprio rótulo no histórico e na faixa', () => {
    const reapply = { ...failed, kind: 'reaplicar' as const };
    expect(historyItemTitle(run({ kind: 'remover', nameservers: null }))).toBe(
      'Remoção da infraestrutura',
    );
    expect(historyItemTitle(run({ kind: 'reaplicar', nameservers: null }))).toBe(
      'Reaplicação da infraestrutura',
    );
    expect(historyItemTitle(reapply)).toBe(
      'Reaplicação da infraestrutura · falhou na etapa Regras',
    );
    expect(infraLiveStatusText({ kind: 'reaplicar', currentStep: 'dns' })).toBe(
      'Reaplicação da infraestrutura em andamento, etapa: Registros de DNS',
    );
    expect(infraLiveResultText(run({ kind: 'reaplicar', nameservers: null }), 'UTC')).toBe(
      'Reaplicação da infraestrutura concluída em 01/10/2026, 12:00 UTC',
    );
  });

  describe('remoção (workspace#97)', () => {
    const removal = run({ kind: 'remover', nameservers: null });

    it('a faixa da remoção aplicando diz a etapa, inclusive a das páginas do site', () => {
      expect(infraLiveStatusText({ kind: 'remover', currentStep: null })).toBe(
        'Remoção da infraestrutura em andamento',
      );
      expect(infraLiveStatusText({ kind: 'remover', currentStep: 'paginas' })).toBe(
        'Remoção da infraestrutura em andamento, etapa: Páginas do site',
      );
    });

    it('o resultado e o título do histórico distinguem a remoção da criação', () => {
      const failedRemoval = run({
        kind: 'remover',
        status: 'falhou',
        nameservers: null,
        failure: { step: 'regras', message: 'Falha simulada' },
      });
      expect(infraLiveResultText(removal, 'UTC')).toBe(
        'Remoção da infraestrutura concluída em 01/10/2026, 12:00 UTC',
      );
      expect(infraLiveResultText(failedRemoval, 'UTC')).toBe(
        'Remoção da infraestrutura falhou na etapa Regras em 01/10/2026, 12:00 UTC: Falha simulada',
      );
      expect(historyItemTitle(removal)).toBe('Remoção da infraestrutura');
      expect(historyItemTitle(failedRemoval)).toBe(
        'Remoção da infraestrutura · falhou na etapa Regras',
      );
    });

    it('a remoção mais recente ignora criações e outros itens', () => {
      const older = run({ id: 1, kind: 'remover', status: 'falhou' });
      expect(latestInfraRemoval([failed, removal, older])).toBe(removal);
      expect(latestInfraRemoval([failed])).toBeUndefined();
    });
  });
});
