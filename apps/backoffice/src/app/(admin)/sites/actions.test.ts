import type { SiteConfig } from '@orakel/content-model/v1';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSiteAction, updateSiteConfigAction } from './actions.ts';

// As actions só traduzem: sessão → recusa, Result do domínio → issues com path, sucesso →
// revalida a lista. Regras e permissão estão nos testes de contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  createSite: vi.fn(),
  updateSiteConfig: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/builds/builds.ts', () => ({ requestBuildNow: vi.fn() }));
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
