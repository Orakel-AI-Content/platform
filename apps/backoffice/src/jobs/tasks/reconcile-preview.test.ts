import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as PreviewModule from '../../domain/preview/preview.ts';

import type { Db } from '../../db/client.ts';
import { fakeRuntime } from '../../domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../domain/builds/plan.ts';
import type { PreviewState } from '../../domain/preview/preview.ts';
import {
  createReconcilePreviewTask,
  PREVIEW_HEALTH_POLL_MS,
  PREVIEW_HEALTH_TIMEOUT_MS,
} from './reconcile-preview.ts';

// As transições do estado são espionadas; o banco de verdade fica no contrato
// (preview.contract.test.ts).
const mocks = vi.hoisted(() => ({
  currentPreviewRelease: vi.fn(),
  readPreviewState: vi.fn(),
  startPreviewUpdate: vi.fn(),
  completePreviewUpdate: vi.fn(),
  failPreviewUpdate: vi.fn(),
  markPreviewWithoutVersion: vi.fn(),
}));
vi.mock('../../domain/preview/preview.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof PreviewModule>()),
  ...mocks,
}));

const db = {} as Db;
const IMAGE = 'ghcr.io/orakel-ai-content/site-builder';
const settings = {
  image: IMAGE,
  exportNetwork: 'orakel-export',
  exportApiUrl: 'http://backoffice-web:3000',
} as BuildSettings;
const preview = { internalNetwork: 'orakel-internal', exportPreviewToken: 'p'.repeat(32) };

const state = (fields: Partial<PreviewState> = {}): PreviewState => ({
  status: 'sem_versao',
  currentRelease: null,
  targetRelease: null,
  failureReason: null,
  updatedAt: null,
  ...fields,
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.readPreviewState.mockResolvedValue(state());
  mocks.completePreviewUpdate.mockResolvedValue(true);
  mocks.failPreviewUpdate.mockResolvedValue(true);
});

const helpers = () =>
  ({
    logger: { info: vi.fn(), warn: vi.fn() },
    job: { attempts: 1, max_attempts: 5 },
  }) as unknown as JobHelpers;

/** Relógio que anda a cada `sleep`, para a espera da saúde estourar sem tempo real. */
function run(
  fake: ReturnType<typeof fakeRuntime>,
  options: { defaultTag?: string } = {},
  events: string[] = [],
) {
  let clock = 0;
  const runtime = {
    ...fake.runtime,
    pullImage: (image: string) => {
      events.push(`pull ${image}`);
      return fake.runtime.pullImage(image);
    },
    startService: (spec: Parameters<typeof fake.runtime.startService>[0]) => {
      events.push(`start ${spec.name}`);
      return fake.runtime.startService(spec);
    },
    health: async (id: string) => {
      const health = await fake.runtime.health(id);
      events.push(`health ${id} ${health}`);
      return health;
    },
    removeContainer: (id: string) => {
      events.push(`remove ${id}`);
      return fake.runtime.removeContainer(id);
    },
  };
  const task = createReconcilePreviewTask({
    db,
    runtime,
    settings: { ...settings, ...(options.defaultTag && { defaultTag: options.defaultTag }) },
    preview,
    now: () => clock,
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
  });
  return task({}, helpers());
}

describe('reconcile-preview', () => {
  it('versão nova sem imagem: baixa, sobe, espera healthy e só então remove o antigo', async () => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    mocks.readPreviewState.mockResolvedValue(state({ status: 'no_ar', currentRelease: '1.2.0' }));
    const fake = fakeRuntime({ image: false, pull: 'ok', health: ['starting', 'healthy'] });
    const events: string[] = [];

    await run(fake, {}, events);

    expect(mocks.startPreviewUpdate).toHaveBeenCalledWith(db, '1.3.0');
    expect(events).toEqual([
      `pull ${IMAGE}:1.3.0`,
      'remove orakel-preview-1.3.0',
      'start orakel-preview-1.3.0',
      'health orakel-preview-1.3.0 starting',
      'health orakel-preview-1.3.0 healthy',
      'remove orakel-preview-1.2.0',
    ]);
    expect(mocks.completePreviewUpdate).toHaveBeenCalledWith(db, '1.3.0');
    expect(mocks.failPreviewUpdate).not.toHaveBeenCalled();
  });

  it('sobe com o apelido blog-preview nas redes internal e export e o ambiente da prévia', async () => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    const fake = fakeRuntime({});

    await run(fake);

    const [spec] = fake.services;
    expect(spec).toMatchObject({
      name: 'orakel-preview-1.3.0',
      image: `${IMAGE}:1.3.0`,
      command: ['ssr'],
      env: {
        CONTENT_SOURCE: 'api',
        EXPORT_API_URL: 'http://backoffice-web:3000',
        EXPORT_PREVIEW_TOKEN: 'p'.repeat(32),
        PORT: '4321',
      },
      networks: [
        { name: 'orakel-internal', aliases: ['blog-preview'] },
        { name: 'orakel-export', aliases: ['blog-preview'] },
      ],
    });
    expect(fake.pulled).toEqual([]);
  });

  it('não fica saudável no limite: remove o novo, mantém o antigo e grava falhou', async () => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    mocks.readPreviewState.mockResolvedValue(state({ status: 'no_ar', currentRelease: '1.2.0' }));
    const fake = fakeRuntime({ health: ['starting'] });
    const events: string[] = [];

    await run(fake, {}, events);

    const checks = events.filter((e) => e.startsWith('health'));
    expect(checks).toHaveLength(PREVIEW_HEALTH_TIMEOUT_MS / PREVIEW_HEALTH_POLL_MS + 1);
    expect(fake.removed).toEqual(['orakel-preview-1.3.0', 'orakel-preview-1.3.0']);
    expect(fake.removed).not.toContain('orakel-preview-1.2.0');
    expect(mocks.failPreviewUpdate).toHaveBeenCalledWith(
      db,
      '1.3.0',
      expect.stringMatching(/não ficou saudável em 180 s/),
    );
    expect(mocks.completePreviewUpdate).not.toHaveBeenCalled();
  });

  it('unhealthy: falha sem esperar o limite', async () => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    const fake = fakeRuntime({ health: ['starting', 'unhealthy'] });

    await run(fake);

    expect(mocks.failPreviewUpdate).toHaveBeenCalledWith(
      db,
      '1.3.0',
      expect.stringMatching(/unhealthy/),
    );
    expect(fake.removed.at(-1)).toBe('orakel-preview-1.3.0');
  });

  it.each([
    ['transitório', 'error' as const, /toomanyrequests/],
    ['recusado pelo registry', 'unavailable' as const, /denied/],
    ['sem trazer a imagem', 'absent' as const, /não está no host/],
  ])('pull %s: não sobe nada, mantém o antigo e grava falhou', async (_, pull, reason) => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    mocks.readPreviewState.mockResolvedValue(state({ status: 'no_ar', currentRelease: '1.2.0' }));
    const fake = fakeRuntime({ image: false, pull });

    await run(fake);

    expect(fake.services).toEqual([]);
    expect(fake.removed).toEqual([]);
    expect(mocks.failPreviewUpdate).toHaveBeenCalledWith(
      db,
      '1.3.0',
      expect.stringMatching(reason),
    );
  });

  it('startService recusado: remove o que sobrou do novo e grava falhou', async () => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    const fake = fakeRuntime({ failOn: 'startService' });

    await run(fake);

    expect(fake.removed).toEqual(['orakel-preview-1.3.0', 'orakel-preview-1.3.0']);
    expect(mocks.failPreviewUpdate).toHaveBeenCalledWith(
      db,
      '1.3.0',
      expect.stringMatching(/proxy recusou/),
    );
  });

  it('versão corrente já no ar com o container presente: não faz nada', async () => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    mocks.readPreviewState.mockResolvedValue(state({ status: 'no_ar', currentRelease: '1.3.0' }));
    const fake = fakeRuntime({});
    await fake.runtime.startService({ name: 'orakel-preview-1.3.0' } as never);
    fake.services.length = 0;

    await run(fake);

    expect(fake.services).toEqual([]);
    expect(fake.removed).toEqual([]);
    expect(mocks.startPreviewUpdate).not.toHaveBeenCalled();
  });

  it('versão corrente no ar, mas o container sumiu: sobe de novo a mesma versão', async () => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    mocks.readPreviewState.mockResolvedValue(state({ status: 'no_ar', currentRelease: '1.3.0' }));
    const fake = fakeRuntime({});

    await run(fake);

    expect(fake.services.map((s) => s.name)).toEqual(['orakel-preview-1.3.0']);
    // Só a limpeza da sobra antes do create; o "antigo" é o próprio novo e fica.
    expect(fake.removed).toEqual(['orakel-preview-1.3.0']);
    expect(mocks.completePreviewUpdate).toHaveBeenCalledWith(db, '1.3.0');
  });

  it('falhou antes na mesma versão: tenta de novo', async () => {
    mocks.currentPreviewRelease.mockResolvedValue('1.3.0');
    mocks.readPreviewState.mockResolvedValue(
      state({ status: 'falhou', currentRelease: '1.2.0', targetRelease: '1.3.0' }),
    );
    const fake = fakeRuntime({});

    await run(fake);

    expect(fake.removed).toEqual(['orakel-preview-1.3.0', 'orakel-preview-1.2.0']);
    expect(mocks.completePreviewUpdate).toHaveBeenCalledWith(db, '1.3.0');
  });

  it('sem build ok: usa SITE_BUILDER_TAG', async () => {
    mocks.currentPreviewRelease.mockResolvedValue(null);
    const fake = fakeRuntime({});

    await run(fake, { defaultTag: 'local' });

    expect(fake.services.map((s) => s.image)).toEqual([`${IMAGE}:local`]);
    expect(mocks.completePreviewUpdate).toHaveBeenCalledWith(db, 'local');
  });

  it('sem build ok e sem SITE_BUILDER_TAG: grava sem_versao e não sobe nada', async () => {
    mocks.currentPreviewRelease.mockResolvedValue(null);
    const fake = fakeRuntime({});

    await run(fake);

    expect(mocks.markPreviewWithoutVersion).toHaveBeenCalledWith(db);
    expect(mocks.startPreviewUpdate).not.toHaveBeenCalled();
    expect(fake.services).toEqual([]);
  });
});
