import type { SiteConfig } from '@orakel/content-model/v1';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelBuildAction,
  checkSiteInfraAction,
  confirmInfraBatchAction,
  confirmInfraPlanAction,
  confirmInfraReapplyAction,
  confirmInfraRemovalAction,
  createSiteAction,
  infraBatchAction,
  infraPlanAction,
  pauseSiteAction,
  rebuildOnReleaseAction,
  refreshSitesAction,
  requestInfraBatchAction,
  requestInfraPlanAction,
  requestInfraReapplyAction,
  requestInfraRemovalAction,
  registerG1Action,
  rollbackSiteAction,
  resumeSiteAction,
  retreatLifecycleAction,
  revertReleaseAction,
  setBuildWindowAction,
  setDailyPublishLimitAction,
  siteActivityAction,
  siteInfraCheckAction,
  undoLastPublishAction,
  updateSiteConfigAction,
} from './actions.ts';

// As actions só traduzem: sessão → recusa, Result do domínio → issues com path, sucesso →
// revalida a lista. Regras e permissão estão nos testes de contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  createSite: vi.fn(),
  updateSiteConfig: vi.fn(),
  revalidatePath: vi.fn(),
  requestSiteInfraCheck: vi.fn(),
  readSiteInfraCheck: vi.fn(),
  retreatLifecycle: vi.fn(),
  resumeSite: vi.fn(),
  pauseSiteManually: vi.fn(),
  rebuildOnRelease: vi.fn(),
  revertRelease: vi.fn(),
  requestRollback: vi.fn(),
  requestUndoLastPublish: vi.fn(),
  cancelBuild: vi.fn(),
  siteActivity: vi.fn(),
  setBuildWindow: vi.fn(),
  setDailyPublishLimit: vi.fn(),
  registerPolicyTrigger: vi.fn(),
  requestInfraPlan: vi.fn(),
  confirmInfraPlan: vi.fn(),
  readInfraPlan: vi.fn(),
  requestInfraRemovalPlan: vi.fn(),
  confirmInfraRemovalPlan: vi.fn(),
  requestInfraReapplyPlan: vi.fn(),
  confirmInfraReapplyPlan: vi.fn(),
  requestInfraBatchPlans: vi.fn(),
  confirmInfraBatchPlan: vi.fn(),
  latestInfraBatch: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/builds/builds.ts', () => ({
  requestBuildNow: vi.fn(),
  requestRollback: mocks.requestRollback,
  requestUndoLastPublish: mocks.requestUndoLastPublish,
  cancelBuild: mocks.cancelBuild,
  siteActivity: mocks.siteActivity,
}));
vi.mock('@/domain/builds/site-state.ts', () => ({
  retreatLifecycle: mocks.retreatLifecycle,
  resumeSite: mocks.resumeSite,
  pauseSiteManually: mocks.pauseSiteManually,
  rebuildOnRelease: mocks.rebuildOnRelease,
  revertRelease: mocks.revertRelease,
  setBuildWindow: mocks.setBuildWindow,
  setDailyPublishLimit: mocks.setDailyPublishLimit,
}));
vi.mock('@/domain/infra/plan.ts', () => ({
  requestInfraPlan: mocks.requestInfraPlan,
  confirmInfraPlan: mocks.confirmInfraPlan,
  readInfraPlan: mocks.readInfraPlan,
  requestInfraRemovalPlan: mocks.requestInfraRemovalPlan,
  confirmInfraRemovalPlan: mocks.confirmInfraRemovalPlan,
  requestInfraReapplyPlan: mocks.requestInfraReapplyPlan,
  confirmInfraReapplyPlan: mocks.confirmInfraReapplyPlan,
  requestInfraBatchPlans: mocks.requestInfraBatchPlans,
  confirmInfraBatchPlan: mocks.confirmInfraBatchPlan,
}));
vi.mock('@/domain/infra/runs.ts', () => ({ latestInfraBatch: mocks.latestInfraBatch }));
vi.mock('@/domain/sites/policy-triggers.ts', () => ({
  registerPolicyTrigger: mocks.registerPolicyTrigger,
}));
vi.mock('@/domain/sites/sites.ts', () => ({
  createSite: mocks.createSite,
  updateSiteConfig: mocks.updateSiteConfig,
  requestSiteInfraCheck: mocks.requestSiteInfraCheck,
  readSiteInfraCheck: mocks.readSiteInfraCheck,
}));

const operacao = { email: 'operacao@orakel.local', roles: ['operacao'] };
const config = { siteId: 'exemplo-c' } as SiteConfig;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: operacao });
});

describe('Server Actions da configuração do site', () => {
  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await createSiteAction(config)).toMatchObject({ ok: false, issues: [] });
    expect(await updateSiteConfigAction('exemplo-c', config)).toMatchObject({ ok: false });
    expect(mocks.createSite).not.toHaveBeenCalled();
    expect(mocks.updateSiteConfig).not.toHaveBeenCalled();
  });

  it('devolve as issues do domínio com o path, sem revalidar', async () => {
    mocks.createSite.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'semantic.supported-resources',
          message: 'Preset "x" de home não é suportado pela release do site',
          path: ['presets', 'home'],
        },
      ],
    });

    expect(await createSiteAction(config)).toEqual({
      ok: false,
      message: 'Não foi possível salvar a configuração.',
      issues: [
        {
          path: ['presets', 'home'],
          message: 'Preset "x" de home não é suportado pela release do site',
        },
      ],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('cadastro e edição delegam ao domínio com o ator e revalidam a lista', async () => {
    mocks.createSite.mockResolvedValue({ ok: true, value: { siteId: 'exemplo-c' } });
    mocks.updateSiteConfig.mockResolvedValue({ ok: true, value: { version: 2 } });

    expect(await createSiteAction(config)).toEqual({
      ok: true,
      message: 'Site exemplo-c cadastrado.',
    });
    expect(mocks.createSite).toHaveBeenCalledWith({}, operacao, config);
    expect(await updateSiteConfigAction('exemplo-c', config)).toEqual({
      ok: true,
      message: 'Configuração salva (versão 2).',
    });
    expect(mocks.updateSiteConfig).toHaveBeenCalledWith({}, operacao, 'exemplo-c', config);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
  });
});

describe('Server Actions da página do site', () => {
  const done = { ok: true, value: undefined };

  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await checkSiteInfraAction('exemplo-a')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(await registerG1Action('exemplo-a', {})).toMatchObject({ ok: false });
    expect(await setBuildWindowAction('exemplo-a', { buildWindowSeconds: 30 })).toMatchObject({
      ok: false,
    });
    expect(await retreatLifecycleAction('exemplo-a', 'zona_ativa')).toMatchObject({ ok: false });
    expect(mocks.requestSiteInfraCheck).not.toHaveBeenCalled();
    expect(mocks.retreatLifecycle).not.toHaveBeenCalled();
    expect(mocks.registerPolicyTrigger).not.toHaveBeenCalled();
    expect(mocks.setBuildWindow).not.toHaveBeenCalled();
    expect(await setDailyPublishLimitAction('exemplo-a', { dailyPublishLimit: 5 })).toMatchObject({
      ok: false,
    });
    expect(mocks.setDailyPublishLimit).not.toHaveBeenCalled();
  });

  it('a recusa do domínio vira a mensagem, sem revalidar', async () => {
    const step =
      'A infra só é conferida com o site em cadastrado ou infra_aplicada; o site está em zona_ativa';
    mocks.requestSiteInfraCheck.mockResolvedValue({
      ok: false,
      issues: [{ code: 'site.infra_check_step', message: step, path: ['lifecycle'] }],
    });

    expect(await checkSiteInfraAction('exemplo-a')).toEqual({ ok: false, message: step });

    const undo =
      'zona_ativa só pode ser desmarcada com o site em zona_ativa; o site está em publicado';
    mocks.retreatLifecycle.mockResolvedValue({
      ok: false,
      issues: [{ code: 'site.lifecycle_undo_order', message: undo, path: ['lifecycle'] }],
    });
    expect(await retreatLifecycleAction('exemplo-a', 'zona_ativa')).toEqual({
      ok: false,
      message: undo,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('delegam ao domínio com o ator e revalidam a lista e a página', async () => {
    mocks.requestSiteInfraCheck.mockResolvedValue(done);
    mocks.registerPolicyTrigger.mockResolvedValue(done);
    mocks.setBuildWindow.mockResolvedValue(done);
    mocks.setDailyPublishLimit.mockResolvedValue(done);

    expect(await checkSiteInfraAction('exemplo-a')).toEqual({
      ok: true,
      message: 'Conferência da infra enfileirada.',
    });
    expect(mocks.requestSiteInfraCheck).toHaveBeenCalledWith({}, operacao, 'exemplo-a');

    mocks.retreatLifecycle.mockResolvedValue(done);
    expect(await retreatLifecycleAction('exemplo-a', 'zona_ativa')).toEqual({
      ok: true,
      message: 'Zona ativa desmarcada.',
    });
    expect(mocks.retreatLifecycle).toHaveBeenCalledWith({}, operacao, 'exemplo-a', 'zona_ativa');

    expect(await registerG1Action('exemplo-a', { note: '  Políticas publicadas ' })).toEqual({
      ok: true,
      message: 'G1 registrado.',
    });
    expect(mocks.registerPolicyTrigger).toHaveBeenCalledWith(
      {},
      operacao,
      'exemplo-a',
      'G1',
      'Políticas publicadas',
    );
    await registerG1Action('exemplo-a', { note: '   ' });
    expect(mocks.registerPolicyTrigger).toHaveBeenLastCalledWith(
      {},
      operacao,
      'exemplo-a',
      'G1',
      null,
    );

    expect(await setBuildWindowAction('exemplo-a', { buildWindowSeconds: 30 })).toEqual({
      ok: true,
      message: 'Janela de 30 s salva.',
    });
    expect(mocks.setBuildWindow).toHaveBeenCalledWith({}, operacao, 'exemplo-a', 30);
    expect(await setBuildWindowAction('exemplo-a', null)).toEqual({
      ok: true,
      message: 'Janela padrão restaurada.',
    });
    expect(mocks.setBuildWindow).toHaveBeenLastCalledWith({}, operacao, 'exemplo-a', null);

    expect(await setDailyPublishLimitAction('exemplo-a', { dailyPublishLimit: 5 })).toEqual({
      ok: true,
      message: 'Limite de 5 por dia salvo.',
    });
    expect(mocks.setDailyPublishLimit).toHaveBeenCalledWith({}, operacao, 'exemplo-a', 5);
    expect(await setDailyPublishLimitAction('exemplo-a', null)).toEqual({
      ok: true,
      message: 'Limite padrão restaurado.',
    });
    expect(mocks.setDailyPublishLimit).toHaveBeenLastCalledWith({}, operacao, 'exemplo-a', null);

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('"Pausar" delega ao domínio com o motivo; a recusa vira a mensagem, sem revalidar', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await pauseSiteAction('exemplo-a', 'Manutenção')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(mocks.pauseSiteManually).not.toHaveBeenCalled();

    mocks.pauseSiteManually.mockResolvedValueOnce({
      ok: false,
      issues: [
        { code: 'site.already_paused', message: 'O site exemplo-a já está pausado', path: [] },
      ],
    });
    expect(await pauseSiteAction('exemplo-a', 'Manutenção')).toEqual({
      ok: false,
      message: 'O site exemplo-a já está pausado',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.pauseSiteManually.mockResolvedValueOnce(done);
    expect(await pauseSiteAction('exemplo-a', 'Manutenção')).toEqual({
      ok: true,
      message: 'exemplo-a pausado.',
    });
    expect(mocks.pauseSiteManually).toHaveBeenLastCalledWith(
      {},
      operacao,
      'exemplo-a',
      'Manutenção',
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('"Retomar" delega ao domínio; a recusa vira a mensagem, sem revalidar', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await resumeSiteAction('exemplo-a')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(mocks.resumeSite).not.toHaveBeenCalled();

    mocks.resumeSite.mockResolvedValueOnce({
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão para operations.run', path: [] }],
    });
    expect(await resumeSiteAction('exemplo-a')).toEqual({
      ok: false,
      message: 'Sem permissão para operations.run',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.resumeSite.mockResolvedValueOnce(done);
    expect(await resumeSiteAction('exemplo-a')).toEqual({
      ok: true,
      message: 'exemplo-a retomado; build enfileirado.',
    });
    expect(mocks.resumeSite).toHaveBeenLastCalledWith({}, operacao, 'exemplo-a');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('"Reconstruir na release" delega ao domínio; a recusa vira a mensagem, sem revalidar', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await rebuildOnReleaseAction('exemplo-a', '1.2.0')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(mocks.rebuildOnRelease).not.toHaveBeenCalled();

    mocks.rebuildOnRelease.mockResolvedValueOnce({
      ok: false,
      issues: [
        {
          code: 'release.not_registered',
          message: 'A release 9.9.9 não está registrada',
          path: ['release'],
        },
      ],
    });
    expect(await rebuildOnReleaseAction('exemplo-a', '9.9.9')).toEqual({
      ok: false,
      message: 'A release 9.9.9 não está registrada',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.rebuildOnRelease.mockResolvedValueOnce(done);
    expect(await rebuildOnReleaseAction('exemplo-a', '1.2.0')).toEqual({
      ok: true,
      message: 'exemplo-a na release 1.2.0; build enfileirado.',
    });
    expect(mocks.rebuildOnRelease).toHaveBeenLastCalledWith({}, operacao, 'exemplo-a', '1.2.0');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('"Reverter" delega ao domínio; a recusa vira a mensagem, sem revalidar', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await rollbackSiteAction('exemplo-a', 'v-antiga')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(mocks.requestRollback).not.toHaveBeenCalled();

    mocks.requestRollback.mockResolvedValueOnce({
      ok: false,
      issues: [
        {
          code: 'rollback.version_active',
          message: 'A versão v-atual já está no ar',
          path: ['versionId'],
        },
      ],
    });
    expect(await rollbackSiteAction('exemplo-a', 'v-atual')).toEqual({
      ok: false,
      message: 'A versão v-atual já está no ar',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.requestRollback.mockResolvedValueOnce(done);
    expect(await rollbackSiteAction('exemplo-a', 'v-antiga')).toEqual({
      ok: true,
      message: 'Rollback de exemplo-a para v-antiga enfileirado.',
    });
    expect(mocks.requestRollback).toHaveBeenLastCalledWith({}, operacao, 'exemplo-a', 'v-antiga');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('"Desfazer última publicação" só delega ao domínio; a recusa vira a mensagem, sem revalidar', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await undoLastPublishAction('exemplo-a')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(mocks.requestUndoLastPublish).not.toHaveBeenCalled();

    mocks.requestUndoLastPublish.mockResolvedValueOnce({
      ok: false,
      issues: [
        {
          code: 'rollback.no_previous',
          message: 'O site exemplo-a não tem versão anterior publicada para voltar',
          path: [],
        },
      ],
    });
    expect(await undoLastPublishAction('exemplo-a')).toEqual({
      ok: false,
      message: 'O site exemplo-a não tem versão anterior publicada para voltar',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.requestUndoLastPublish.mockResolvedValueOnce({
      ok: true,
      value: { versionId: 'v-antiga', release: '1.2.0', pages: 10, finishedAt: new Date() },
    });
    expect(await undoLastPublishAction('exemplo-a')).toEqual({
      ok: true,
      message: 'Rollback de exemplo-a para v-antiga enfileirado.',
    });
    expect(mocks.requestUndoLastPublish).toHaveBeenLastCalledWith({}, operacao, 'exemplo-a');
    expect(mocks.requestRollback).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('"Voltar à versão anterior" só delega ao domínio; a recusa vira a mensagem, sem revalidar', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await revertReleaseAction('exemplo-a')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(mocks.revertRelease).not.toHaveBeenCalled();

    mocks.revertRelease.mockResolvedValueOnce({
      ok: false,
      issues: [
        {
          code: 'release.no_previous',
          message: 'O site exemplo-a não tem versão anterior disponível para voltar',
          path: [],
        },
      ],
    });
    expect(await revertReleaseAction('exemplo-a')).toEqual({
      ok: false,
      message: 'O site exemplo-a não tem versão anterior disponível para voltar',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.revertRelease.mockResolvedValueOnce({ ok: true, value: '1.3.2' });
    expect(await revertReleaseAction('exemplo-a')).toEqual({
      ok: true,
      message: 'exemplo-a de volta à release 1.3.2; build enfileirado.',
    });
    expect(mocks.revertRelease).toHaveBeenLastCalledWith({}, operacao, 'exemplo-a');
    expect(mocks.rebuildOnRelease).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('"Cancelar" só delega ao domínio; a recusa vira a mensagem, sem revalidar', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await cancelBuildAction('exemplo-a')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(mocks.cancelBuild).not.toHaveBeenCalled();

    mocks.cancelBuild.mockResolvedValueOnce({
      ok: false,
      issues: [
        {
          code: 'build.not_open',
          message: 'O site exemplo-a não tem publicação na fila nem em andamento',
          path: [],
        },
      ],
    });
    expect(await cancelBuildAction('exemplo-a')).toEqual({
      ok: false,
      message: 'O site exemplo-a não tem publicação na fila nem em andamento',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.cancelBuild.mockResolvedValueOnce({ ok: true, value: 'cancelado' });
    expect(await cancelBuildAction('exemplo-a')).toEqual({
      ok: true,
      message: 'Publicação de exemplo-a cancelada.',
    });
    mocks.cancelBuild.mockResolvedValueOnce({ ok: true, value: 'pedido' });
    expect(await cancelBuildAction('exemplo-a')).toEqual({
      ok: true,
      message: 'Cancelamento da publicação em andamento de exemplo-a pedido.',
    });
    expect(mocks.cancelBuild).toHaveBeenLastCalledWith({}, operacao, 'exemplo-a');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('formulário de operação (#333): valor fora do schema volta como issue do campo, sem chamar o domínio', async () => {
    for (const buildWindowSeconds of [-1, 1.5, 'x']) {
      expect(await setBuildWindowAction('exemplo-a', { buildWindowSeconds } as never)).toEqual({
        ok: false,
        message: 'Não foi possível concluir.',
        issues: [
          {
            path: ['buildWindowSeconds'],
            message: 'Informe um número inteiro de segundos, 0 ou mais.',
          },
        ],
      });
    }
    expect(mocks.setBuildWindow).not.toHaveBeenCalled();
    for (const dailyPublishLimit of [0, -1, 1.5, 'x']) {
      expect(await setDailyPublishLimitAction('exemplo-a', { dailyPublishLimit } as never)).toEqual(
        {
          ok: false,
          message: 'Não foi possível concluir.',
          issues: [
            {
              path: ['dailyPublishLimit'],
              message: 'Informe um número inteiro de publicações, 1 ou mais.',
            },
          ],
        },
      );
    }
    expect(mocks.setDailyPublishLimit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('formulário de operação (#333): a recusa do domínio volta com o path do campo', async () => {
    mocks.setBuildWindow.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'site.build_window_invalid',
          message: 'Janela recusada',
          path: ['buildWindowSeconds'],
        },
      ],
    });

    expect(await setBuildWindowAction('exemplo-a', { buildWindowSeconds: 30 })).toEqual({
      ok: false,
      message: 'Não foi possível concluir.',
      issues: [{ path: ['buildWindowSeconds'], message: 'Janela recusada' }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('siteActivityAction (#635)', () => {
  const activity = {
    open: {
      id: 3,
      kind: 'build',
      status: 'rodando',
      currentStage: 'render',
      scheduledFor: null,
      startedAt: new Date('2026-11-11T12:00:00Z'),
      requestedBy: 'operacao@orakel.local',
      cancelRequestedAt: null,
    },
    history: [
      {
        type: 'evento',
        id: 1,
        kind: 'retomada',
        requestedBy: 'operacao@orakel.local',
        at: new Date('2026-11-11T11:00:00Z'),
        reason: null,
        previousRelease: null,
        release: null,
      },
    ],
  };

  it('só delega ao domínio com quem está na sessão e devolve a atividade, sem revalidar', async () => {
    mocks.siteActivity.mockResolvedValue({ ok: true, value: activity });

    const result = await siteActivityAction('exemplo-a');

    expect(result).toEqual(activity);
    expect(structuredClone(result)).toEqual(activity);
    expect(mocks.siteActivity).toHaveBeenCalledWith(expect.anything(), operacao, 'exemplo-a');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sem sessão devolve null sem chamar o domínio; recusa do domínio também vira null', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await siteActivityAction('exemplo-a')).toBeNull();
    expect(mocks.siteActivity).not.toHaveBeenCalled();

    mocks.siteActivity.mockResolvedValue({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(await siteActivityAction('exemplo-a')).toBeNull();
  });
});

describe('siteInfraCheckAction (#716)', () => {
  const check = {
    lifecycle: 'cadastrado',
    checkedAt: new Date('2026-11-12T12:00:00Z'),
    error: null,
    queued: true,
  };

  it('só delega ao domínio com quem está na sessão e devolve a conferência, sem revalidar', async () => {
    mocks.readSiteInfraCheck.mockResolvedValue({ ok: true, value: check });

    const result = await siteInfraCheckAction('exemplo-a');

    expect(result).toEqual(check);
    expect(structuredClone(result)).toEqual(check);
    expect(mocks.readSiteInfraCheck).toHaveBeenCalledWith(expect.anything(), operacao, 'exemplo-a');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sem sessão devolve null sem chamar o domínio; recusa do domínio também vira null', async () => {
    mocks.currentActor.mockResolvedValueOnce({ ok: false, issues: [] });
    expect(await siteInfraCheckAction('exemplo-a')).toBeNull();
    expect(mocks.readSiteInfraCheck).not.toHaveBeenCalled();

    mocks.readSiteInfraCheck.mockResolvedValue({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(await siteInfraCheckAction('exemplo-a')).toBeNull();
  });
});

describe('criar infraestrutura (#825)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentActor.mockResolvedValue({ ok: true, value: operacao });
  });

  it('pedir devolve a execução e revalida a página do site', async () => {
    mocks.requestInfraPlan.mockResolvedValue({ ok: true, value: { runId: 7 } });

    expect(await requestInfraPlanAction('exemplo-a')).toEqual({ ok: true, runId: 7 });
    expect(mocks.requestInfraPlan).toHaveBeenCalledWith({}, operacao, 'exemplo-a');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('a recusa do pedido vira a mensagem, sem revalidar', async () => {
    const message = 'O site exemplo-a já tem uma criação de infraestrutura aberta';
    mocks.requestInfraPlan.mockResolvedValue({
      ok: false,
      issues: [{ code: 'infra.run_open', message, path: [] }],
    });

    expect(await requestInfraPlanAction('exemplo-a')).toEqual({ ok: false, message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('confirmar chama o domínio com a execução e revalida', async () => {
    mocks.confirmInfraPlan.mockResolvedValue({ ok: true, value: undefined });

    expect(await confirmInfraPlanAction('exemplo-a', 7)).toEqual({
      ok: true,
      message: 'Criação da infraestrutura confirmada.',
    });
    expect(mocks.confirmInfraPlan).toHaveBeenCalledWith({}, operacao, 'exemplo-a', 7);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('ler o plano devolve a visão do domínio, ou null na recusa', async () => {
    mocks.readInfraPlan.mockResolvedValueOnce({ ok: true, value: { status: 'planejando' } });
    expect(await infraPlanAction('exemplo-a', 7)).toEqual({ status: 'planejando' });

    mocks.readInfraPlan.mockResolvedValueOnce({
      ok: false,
      issues: [{ code: 'forbidden', message: 'x', path: [] }],
    });
    expect(await infraPlanAction('exemplo-a', 7)).toBeNull();
  });

  it('sem sessão, nada chega ao domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await requestInfraPlanAction('exemplo-a')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(await confirmInfraPlanAction('exemplo-a', 7)).toMatchObject({ ok: false });
    expect(await infraPlanAction('exemplo-a', 7)).toBeNull();
    expect(mocks.requestInfraPlan).not.toHaveBeenCalled();
    expect(mocks.confirmInfraPlan).not.toHaveBeenCalled();
    expect(mocks.readInfraPlan).not.toHaveBeenCalled();
  });
});

describe('remover infraestrutura (workspace#97)', () => {
  const admin = { email: 'adm@orakel.local', roles: ['admin' as const] };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentActor.mockResolvedValue({ ok: true, value: admin });
  });

  it('pedir devolve a execução e revalida a página do site', async () => {
    mocks.requestInfraRemovalPlan.mockResolvedValue({ ok: true, value: { runId: 9 } });

    expect(await requestInfraRemovalAction('exemplo-a')).toEqual({ ok: true, runId: 9 });
    expect(mocks.requestInfraRemovalPlan).toHaveBeenCalledWith({}, admin, 'exemplo-a');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('a recusa do pedido vira a mensagem, sem revalidar', async () => {
    const message = 'O site exemplo-a está ativo';
    mocks.requestInfraRemovalPlan.mockResolvedValue({
      ok: false,
      issues: [{ code: 'site.not_paused', message, path: [] }],
    });

    expect(await requestInfraRemovalAction('exemplo-a')).toEqual({ ok: false, message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('confirmar passa o domínio digitado ao domínio', async () => {
    mocks.confirmInfraRemovalPlan.mockResolvedValue({ ok: true, value: undefined });

    expect(await confirmInfraRemovalAction('exemplo-a', 9, 'exemplo-a.com.br')).toEqual({
      ok: true,
      message: 'Remoção da infraestrutura confirmada.',
    });
    expect(mocks.confirmInfraRemovalPlan).toHaveBeenCalledWith(
      {},
      admin,
      'exemplo-a',
      9,
      'exemplo-a.com.br',
    );
  });

  it('domínio errado: a recusa do domínio volta como erro', async () => {
    const message = 'O domínio digitado não é o do site; a remoção não foi confirmada';
    mocks.confirmInfraRemovalPlan.mockResolvedValue({
      ok: false,
      issues: [{ code: 'infra.domain_mismatch', message, path: ['domain'] }],
    });

    expect(await confirmInfraRemovalAction('exemplo-a', 9, 'outro.com')).toMatchObject({
      ok: false,
      message,
    });
  });

  it('sem sessão, nada chega ao domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await requestInfraRemovalAction('exemplo-a')).toMatchObject({ ok: false });
    expect(await confirmInfraRemovalAction('exemplo-a', 9, 'x')).toMatchObject({ ok: false });
    expect(mocks.requestInfraRemovalPlan).not.toHaveBeenCalled();
    expect(mocks.confirmInfraRemovalPlan).not.toHaveBeenCalled();
  });
});

describe('reaplicar infraestrutura (workspace#98)', () => {
  it('pedir devolve a execução e revalida a página do site', async () => {
    mocks.requestInfraReapplyPlan.mockResolvedValue({ ok: true, value: { runId: 12 } });

    expect(await requestInfraReapplyAction('exemplo-a')).toEqual({ ok: true, runId: 12 });
    expect(mocks.requestInfraReapplyPlan).toHaveBeenCalledWith({}, operacao, 'exemplo-a');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a');
  });

  it('a recusa do pedido vira a mensagem, sem revalidar', async () => {
    const message = 'O site exemplo-a já tem uma execução de infraestrutura aberta';
    mocks.requestInfraReapplyPlan.mockResolvedValue({
      ok: false,
      issues: [{ code: 'infra.run_open', message, path: [] }],
    });

    expect(await requestInfraReapplyAction('exemplo-a')).toEqual({ ok: false, message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('confirmar passa a execução ao domínio e devolve a mensagem de sucesso', async () => {
    mocks.confirmInfraReapplyPlan.mockResolvedValue({ ok: true, value: undefined });

    expect(await confirmInfraReapplyAction('exemplo-a', 12)).toEqual({
      ok: true,
      message: 'Reaplicação da infraestrutura confirmada.',
    });
    expect(mocks.confirmInfraReapplyPlan).toHaveBeenCalledWith({}, operacao, 'exemplo-a', 12);
  });

  it('sem sessão, nada chega ao domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await requestInfraReapplyAction('exemplo-a')).toMatchObject({ ok: false });
    expect(await confirmInfraReapplyAction('exemplo-a', 12)).toMatchObject({ ok: false });
    expect(mocks.requestInfraReapplyPlan).not.toHaveBeenCalled();
    expect(mocks.confirmInfraReapplyPlan).not.toHaveBeenCalled();
  });
});

describe('reaplicar nos desatualizados (workspace#98)', () => {
  const SUMMARY = {
    formatVersion: 1,
    steps: { endereco: [], dns: [], email: [], regras: [], imagens: [] },
  };
  const batch = (sites: unknown[]) => ({
    ok: true,
    value: {
      id: 3,
      state: 'aguardando_confirmacao',
      requestedBy: 'operacao@orakel.local',
      startedAt: new Date('2026-11-13T12:00:00Z'),
      finishedAt: null,
      sites,
    },
  });
  const site = (siteId: string, planSummary: string | null) => ({
    siteId,
    runId: 10,
    position: 0,
    status: 'aguardando_confirmacao',
    currentStep: null,
    planSummary,
    failure: null,
  });

  it('pedir devolve o lote e revalida a lista', async () => {
    mocks.requestInfraBatchPlans.mockResolvedValue({ ok: true, value: { batchId: 3, runs: [] } });

    expect(await requestInfraBatchAction()).toEqual({ ok: true, batchId: 3 });
    expect(mocks.requestInfraBatchPlans).toHaveBeenCalledWith({}, operacao);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
  });

  it('a recusa do pedido vira a mensagem, sem revalidar', async () => {
    const message = 'Nenhum site está com a infraestrutura desatualizada';
    mocks.requestInfraBatchPlans.mockResolvedValue({
      ok: false,
      issues: [{ code: 'infra.batch_empty', message, path: [] }],
    });

    expect(await requestInfraBatchAction()).toEqual({ ok: false, message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('ler devolve o lote com o resumo validado, nulo fora do formato', async () => {
    mocks.latestInfraBatch.mockResolvedValue(
      batch([site('exemplo-a', JSON.stringify(SUMMARY)), site('exemplo-b', '{"x":1}')]),
    );

    const view = await infraBatchAction();
    expect(view?.sites).toEqual([
      expect.objectContaining({ siteId: 'exemplo-a', summary: SUMMARY }),
      expect.objectContaining({ siteId: 'exemplo-b', summary: null }),
    ]);
    expect(view).not.toHaveProperty('sites.0.planSummary');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('ler devolve null sem lote ou na recusa', async () => {
    mocks.latestInfraBatch.mockResolvedValueOnce({ ok: true, value: null });
    expect(await infraBatchAction()).toBeNull();
    mocks.latestInfraBatch.mockResolvedValueOnce({
      ok: false,
      issues: [{ code: 'forbidden', message: 'x', path: [] }],
    });
    expect(await infraBatchAction()).toBeNull();
  });

  it('confirmar passa o lote ao domínio e revalida a lista', async () => {
    mocks.confirmInfraBatchPlan.mockResolvedValue({ ok: true, value: { siteId: 'a', runId: 1 } });

    expect(await confirmInfraBatchAction(3)).toEqual({
      ok: true,
      message: 'Reaplicação nos desatualizados confirmada.',
    });
    expect(mocks.confirmInfraBatchPlan).toHaveBeenCalledWith({}, operacao, 3);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
  });

  it('relê a lista quando o lote fecha', async () => {
    await refreshSitesAction();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites');
  });

  it('sem sessão, nada chega ao domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await requestInfraBatchAction()).toMatchObject({ ok: false });
    expect(await confirmInfraBatchAction(3)).toMatchObject({ ok: false });
    expect(await infraBatchAction()).toBeNull();
    expect(mocks.requestInfraBatchPlans).not.toHaveBeenCalled();
    expect(mocks.confirmInfraBatchPlan).not.toHaveBeenCalled();
    expect(mocks.latestInfraBatch).not.toHaveBeenCalled();
  });
});
