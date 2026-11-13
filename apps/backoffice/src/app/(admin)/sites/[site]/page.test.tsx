// @vitest-environment happy-dom
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LifecycleAction } from '@/components/sites/SiteActions';

// Página do site (#825): "Criar infraestrutura" vem no `LifecycleAction` da etapa Infra e zona,
// que a página só passa com site.configure (admin e operação), com a execução aberta do site.

const state = vi.hoisted(() => ({
  roles: ['operacao'] as string[],
  openInfra: null as null | Record<string, unknown>,
  history: [] as Record<string, unknown>[],
}));

const ok = <T,>(value: T) => Promise.resolve({ ok: true, value });

vi.mock('./editorial-page.tsx', () => ({
  sitePageContext: () =>
    ok({
      actor: { email: 'pessoa@orakel.local', roles: state.roles },
      db: {},
      canWrite: false,
      site: {
        id: 'exemplo-a',
        name: 'Exemplo A',
        timeZone: 'UTC',
        lifecycle: 'cadastrado',
        release: '1.0.0',
        activeVersionId: null,
        state: 'ativo',
        pausedReason: null,
        buildWindowSeconds: null,
        effectiveBuildWindowSeconds: 60,
        dailyPublishLimit: null,
        effectiveDailyPublishLimit: 10,
        publishedToday: 0,
      },
    }),
}));
vi.mock('../actions.ts', () => ({
  cancelBuildAction: vi.fn(),
  checkSiteInfraAction: vi.fn(),
  confirmInfraPlanAction: vi.fn(),
  infraPlanAction: vi.fn(),
  pauseSiteAction: vi.fn(),
  publishNow: vi.fn(),
  rebuildOnReleaseAction: vi.fn(),
  registerG1Action: vi.fn(),
  requestInfraPlanAction: vi.fn(),
  resumeSiteAction: vi.fn(),
  retreatLifecycleAction: vi.fn(),
  revertReleaseAction: vi.fn(),
  rollbackSiteAction: vi.fn(),
  setBuildWindowAction: vi.fn(),
  setDailyPublishLimitAction: vi.fn(),
  siteActivityAction: vi.fn(),
  siteInfraCheckAction: vi.fn(),
  undoLastPublishAction: vi.fn(),
}));
vi.mock('@/domain/sites/policy-triggers.ts', () => ({ listPolicyTriggers: () => ok([]) }));
vi.mock('@/domain/sites/sites.ts', () => ({
  readSiteInfraCheck: () => ok({ lifecycle: 'cadastrado', queued: false, error: null }),
  readSiteInstance: () => ok({ activePages: 0, activeSince: null }),
  redirectUsageFor: () => ok({ alert: false }),
}));
vi.mock('@/domain/content/contents.ts', () => ({ countContentsByStatus: () => ok({}) }));
vi.mock('@/domain/builds/builds.ts', () => ({
  siteActivity: () => ok({ open: null, openInfra: state.openInfra, history: state.history }),
  listRollbackVersions: () => ok([]),
  previousVersion: () => ok(null),
}));
vi.mock('@/domain/builds/site-state.ts', () => ({ previousRelease: () => ok(null) }));
vi.mock('@/domain/releases/releases.ts', () => ({
  latestAvailableRelease: () => Promise.resolve(null),
  listReleases: () => ok([]),
}));

const { default: SitePage } = await import('./page.tsx');

/** Primeiro elemento do tipo pedido, descendo pelos filhos e pelas props que são elementos. */
function find(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  if (node.type === type) return node;
  for (const value of Object.values(node.props)) {
    const found = find(value, type);
    if (found) return found;
  }
  return undefined;
}

async function lifecycleAction() {
  const page = await SitePage({ params: Promise.resolve({ site: 'exemplo-a' }) });
  return find(page, LifecycleAction);
}

describe('página do site: Criar infraestrutura', () => {
  beforeEach(() => {
    state.openInfra = null;
    state.history = [];
  });

  it.each([['admin'], ['operacao']])('%s recebe a ação com a infra do site', async (role) => {
    state.roles = [role];
    const infra = (await lifecycleAction())?.props.infra as Record<string, unknown> | undefined;
    expect(infra?.open).toBeNull();
    for (const key of ['request', 'read', 'confirm']) {
      expect(typeof infra?.[key]).toBe('function');
    }
  });

  it.each([['editor'], ['revisor']])('%s não recebe a ação', async (role) => {
    state.roles = [role];
    expect(await lifecycleAction()).toBeUndefined();
  });

  it('a execução aberta vai só com o id e o estado', async () => {
    state.roles = ['operacao'];
    state.openInfra = {
      id: 4,
      status: 'aguardando_confirmacao',
      currentStep: null,
      planSummary: '{}',
      requestedBy: 'x@orakel.local',
      requestedAt: new Date(0),
      confirmedBy: null,
    };
    const action = await lifecycleAction();
    expect((action?.props.infra as { open: unknown }).open).toEqual({
      id: 4,
      status: 'aguardando_confirmacao',
    });
  });

  it('com a última criação em falha, a ação vem com "Tentar de novo" (#826)', async () => {
    state.roles = ['operacao'];
    const creation = (id: number, status: string) => ({ type: 'infra', id, kind: 'criar', status });
    state.history = [
      { type: 'infra', id: 9, kind: 'remover', status: 'ok' },
      creation(3, 'falhou'),
    ];
    expect(((await lifecycleAction())?.props.infra as { retry: boolean }).retry).toBe(true);

    state.history = [creation(4, 'ok'), creation(3, 'falhou')];
    expect(((await lifecycleAction())?.props.infra as { retry: boolean }).retry).toBe(false);
  });
});
