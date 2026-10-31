import type { SiteConfig } from '@orakel/content-model/v1';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advanceLifecycleAction,
  createSiteAction,
  registerG1Action,
  setBuildWindowAction,
  setDailyPublishLimitAction,
  updateSiteConfigAction,
} from './actions.ts';

// As actions só traduzem: sessão → recusa, Result do domínio → issues com path, sucesso →
// revalida a lista. Regras e permissão estão nos testes de contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  createSite: vi.fn(),
  updateSiteConfig: vi.fn(),
  revalidatePath: vi.fn(),
  advanceLifecycle: vi.fn(),
  setBuildWindow: vi.fn(),
  setDailyPublishLimit: vi.fn(),
  registerPolicyTrigger: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/builds/builds.ts', () => ({ requestBuildNow: vi.fn() }));
vi.mock('@/domain/builds/site-state.ts', () => ({
  advanceLifecycle: mocks.advanceLifecycle,
  setBuildWindow: mocks.setBuildWindow,
  setDailyPublishLimit: mocks.setDailyPublishLimit,
}));
vi.mock('@/domain/sites/policy-triggers.ts', () => ({
  registerPolicyTrigger: mocks.registerPolicyTrigger,
}));
vi.mock('@/domain/sites/sites.ts', () => ({
  createSite: mocks.createSite,
  updateSiteConfig: mocks.updateSiteConfig,
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

    expect(await advanceLifecycleAction('exemplo-a', 'infra_aplicada')).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(await registerG1Action('exemplo-a', {})).toMatchObject({ ok: false });
    expect(await setBuildWindowAction('exemplo-a', { buildWindowSeconds: 30 })).toMatchObject({
      ok: false,
    });
    expect(mocks.advanceLifecycle).not.toHaveBeenCalled();
    expect(mocks.registerPolicyTrigger).not.toHaveBeenCalled();
    expect(mocks.setBuildWindow).not.toHaveBeenCalled();
    expect(await setDailyPublishLimitAction('exemplo-a', { dailyPublishLimit: 5 })).toMatchObject({
      ok: false,
    });
    expect(mocks.setDailyPublishLimit).not.toHaveBeenCalled();
  });

  it('a recusa do domínio vira a mensagem, sem revalidar', async () => {
    mocks.advanceLifecycle.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'site.lifecycle_order',
          message:
            'zona_ativa só pode ser marcada a partir de infra_aplicada; o site está em cadastrado',
          path: ['lifecycle'],
        },
      ],
    });

    expect(await advanceLifecycleAction('exemplo-a', 'zona_ativa')).toEqual({
      ok: false,
      message:
        'zona_ativa só pode ser marcada a partir de infra_aplicada; o site está em cadastrado',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('delegam ao domínio com o ator e revalidam a lista e a página', async () => {
    mocks.advanceLifecycle.mockResolvedValue(done);
    mocks.registerPolicyTrigger.mockResolvedValue(done);
    mocks.setBuildWindow.mockResolvedValue(done);
    mocks.setDailyPublishLimit.mockResolvedValue(done);

    expect(await advanceLifecycleAction('exemplo-a', 'infra_aplicada')).toEqual({
      ok: true,
      message: 'Infra aplicada marcada.',
    });
    expect(mocks.advanceLifecycle).toHaveBeenCalledWith(
      {},
      operacao,
      'exemplo-a',
      'infra_aplicada',
    );

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
