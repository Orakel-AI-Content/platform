// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageHeader } from '@/components/shared/PageHeader';
import { LifecycleAction } from '@/components/sites/SiteActions';
import { SitePublicationTab } from '@/components/sites/SitePublicationTab';

// Página do site (#825): "Criar infraestrutura" vem no `LifecycleAction` da etapa Infra e zona,
// que a página só passa com site.configure (admin e operação), com a execução aberta do site.
// "Remover infraestrutura" (workspace#97) vai no mesmo `LifecycleAction`, só com site.destroy;
// "Reaplicar infraestrutura" (workspace#98), com site.configure.

const state = vi.hoisted(() => ({
  roles: ['operacao'] as string[],
  canWrite: false,
  openInfra: null as null | Record<string, unknown>,
  history: [] as Record<string, unknown>[],
  driftStatus: null as null | 'em_dia' | 'desatualizado',
}));

const ok = <T,>(value: T) => Promise.resolve({ ok: true, value });

vi.mock('./editorial-page.tsx', () => ({
  sitePageContext: () =>
    ok({
      actor: { email: 'pessoa@orakel.local', roles: state.roles },
      db: {},
      canWrite: state.canWrite,
      site: {
        id: 'exemplo-a',
        name: 'Exemplo A',
        domain: 'exemplo-a.com.br',
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
        infraDrift: { status: state.driftStatus, summary: null, checkedAt: null, error: null },
      },
    }),
}));
vi.mock('../actions.ts', () => ({
  cancelBuildAction: vi.fn(),
  checkSiteInfraAction: vi.fn(),
  confirmInfraPlanAction: vi.fn(),
  confirmInfraReapplyAction: vi.fn(),
  confirmInfraRemovalAction: vi.fn(),
  infraPlanAction: vi.fn(),
  pauseSiteAction: vi.fn(),
  publishNow: vi.fn(),
  rebuildOnReleaseAction: vi.fn(),
  registerG1Action: vi.fn(),
  requestInfraPlanAction: vi.fn(),
  requestInfraReapplyAction: vi.fn(),
  requestInfraRemovalAction: vi.fn(),
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

describe('página do site: Remover infraestrutura', () => {
  beforeEach(() => {
    state.openInfra = null;
    state.history = [];
  });

  it('admin recebe a remoção com o domínio, as páginas no ar e o site ativo', async () => {
    state.roles = ['admin'];
    const remove = (await lifecycleAction())?.props.remove as Record<string, unknown> | undefined;
    expect(remove).toMatchObject({
      domain: 'exemplo-a.com.br',
      activePages: 0,
      active: true,
      open: null,
    });
    for (const key of ['request', 'read', 'confirm']) {
      expect(typeof remove?.[key]).toBe('function');
    }
  });

  it('operação recebe a criação, mas não a remoção', async () => {
    state.roles = ['operacao'];
    const action = await lifecycleAction();
    expect(action?.props.infra).toBeDefined();
    expect(action?.props.remove).toBeUndefined();
  });

  it('com a última remoção em falha, a remoção vem com "Tentar de novo"', async () => {
    state.roles = ['admin'];
    const removal = (id: number, status: string) => ({
      type: 'infra',
      id,
      kind: 'remover',
      status,
    });
    state.history = [{ type: 'infra', id: 9, kind: 'criar', status: 'ok' }, removal(3, 'falhou')];
    expect(((await lifecycleAction())?.props.remove as { retry: boolean }).retry).toBe(true);

    state.history = [removal(4, 'ok'), removal(3, 'falhou')];
    expect(((await lifecycleAction())?.props.remove as { retry: boolean }).retry).toBe(false);
  });

  it('a execução aberta vai com o tipo, para reabrir só a remoção', async () => {
    state.roles = ['admin'];
    state.openInfra = { id: 5, kind: 'remover', status: 'aguardando_confirmacao' };
    const remove = (await lifecycleAction())?.props.remove as { open: unknown };
    expect(remove.open).toEqual({ id: 5, kind: 'remover', status: 'aguardando_confirmacao' });
  });
});

describe('página do site: Reaplicar infraestrutura', () => {
  beforeEach(() => {
    state.openInfra = null;
    state.history = [];
    state.driftStatus = null;
  });

  it.each([['admin'], ['operacao']])('%s recebe a reaplicação', async (role) => {
    state.roles = [role];
    const reapply = (await lifecycleAction())?.props.reapply as Record<string, unknown> | undefined;
    expect(reapply?.open).toBeNull();
    expect(reapply?.retry).toBe(false);
    for (const key of ['request', 'read', 'confirm']) {
      expect(typeof reapply?.[key]).toBe('function');
    }
  });

  it('a execução aberta vai com o tipo e o lote, para reabrir só a reaplicação pedida no site', async () => {
    state.roles = ['operacao'];
    state.openInfra = { id: 6, kind: 'reaplicar', status: 'planejando', inBatch: true };
    const reapply = (await lifecycleAction())?.props.reapply as { open: unknown };
    expect(reapply.open).toEqual({ id: 6, kind: 'reaplicar', status: 'planejando', inBatch: true });
  });

  it('com a última reaplicação em falha, vem com "Tentar de novo"', async () => {
    state.roles = ['operacao'];
    const reapply = (id: number, status: string) => ({
      type: 'infra',
      id,
      kind: 'reaplicar',
      status,
    });
    state.history = [{ type: 'infra', id: 9, kind: 'criar', status: 'ok' }, reapply(3, 'falhou')];
    expect(((await lifecycleAction())?.props.reapply as { retry: boolean }).retry).toBe(true);

    state.history = [reapply(4, 'ok'), reapply(3, 'falhou')];
    expect(((await lifecycleAction())?.props.reapply as { retry: boolean }).retry).toBe(false);
  });

  it.each([['desatualizado' as const], ['em_dia' as const], [null]])(
    'a aba Publicação recebe o resultado da conferência (%s), para todos os papéis',
    async (driftStatus) => {
      state.roles = ['editor'];
      state.driftStatus = driftStatus;
      const page = await SitePage({ params: Promise.resolve({ site: 'exemplo-a' }) });
      const tab = find(page, SitePublicationTab);
      expect((tab?.props.site as { infraDriftStatus: unknown }).infraDriftStatus).toBe(driftStatus);
    },
  );
});

describe('página do site: ações do topo (#873)', () => {
  afterEach(() => {
    cleanup();
    state.canWrite = false;
  });

  async function headerLinks() {
    const page = await SitePage({ params: Promise.resolve({ site: 'exemplo-a' }) });
    render(<>{find(page, PageHeader)?.props.action as ReactNode}</>);
    return screen.getAllByRole('link').map((link) => ({
      name: link.textContent,
      href: link.getAttribute('href'),
      solid: link.className.includes('bg-primary'),
    }));
  }

  it('admin com escrita: Revisar, Editar configuração e Criar conteúdo, só o último solid', async () => {
    state.roles = ['admin'];
    state.canWrite = true;
    expect(await headerLinks()).toEqual([
      { name: 'Revisar', href: '/sites/exemplo-a/revisao', solid: false },
      { name: 'Editar configuração', href: '/sites/exemplo-a/configuracao', solid: false },
      { name: 'Criar conteúdo', href: '/sites/exemplo-a/conteudos/novo', solid: true },
    ]);
  });

  it('sem content.write, "Editar configuração" vira a principal', async () => {
    state.roles = ['operacao'];
    expect(await headerLinks()).toEqual([
      { name: 'Revisar', href: '/sites/exemplo-a/revisao', solid: false },
      { name: 'Editar configuração', href: '/sites/exemplo-a/configuracao', solid: true },
    ]);
  });

  it('sem site.configure nem escrita, só "Revisar"', async () => {
    state.roles = ['revisor'];
    expect((await headerLinks()).map(({ name }) => name)).toEqual(['Revisar']);
  });
});
