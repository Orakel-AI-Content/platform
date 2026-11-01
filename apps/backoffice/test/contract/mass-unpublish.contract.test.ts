import { eq } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { builds, contentVersions, redirects, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { loadBuildTarget, recordBuild } from '../../src/domain/builds/builds.ts';
import {
  failedFile,
  fakeRuntime,
  publishOk,
  renderOk,
} from '../../src/domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../src/domain/builds/plan.ts';
import type { BuildOutcome } from '../../src/domain/builds/run-build.ts';
import { declareMassUnpublish } from '../../src/domain/builds/site-state.ts';
import { liveVersion } from '../../src/domain/content/contents.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { unpublishContent, unpublishContents } from '../../src/domain/publications/unpublish.ts';
import { createBuildTask } from '../../src/jobs/tasks/build.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Despublicação em massa declarada (#493, workspace#20 R7). Na fixture exemplo-a, os
// conteúdos 1, 2 e 3 estão no ar; o 99 não existe.

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const editor: Actor = { email: 'editor@orakel.local', roles: ['editor'] };

const settings: BuildSettings = {
  image: 'site-builder',
  defaultTag: 'local',
  exportNetwork: 'orakel-export',
  publishNetwork: 'orakel-publish',
  exportApiUrl: 'http://backoffice-web:3000',
  exportBuildToken: 'b'.repeat(32),
  pageDropTolerance: 0.2,
  deploy: { target: 'local', edgeLocalUrl: 'http://edge-local:8081' },
  s3: { endpoint: 'http://s3:8333', accessKeyId: 'k', secretAccessKey: 's' },
};
const silent = { debug() {}, info() {}, warn() {}, error() {} };
const helpers = () => ({ logger: silent, job: { id: '7', attempts: 1 } }) as unknown as JobHelpers;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
});

const unpublishBatch = (ids: number[], actor = revisor) =>
  db.transaction((tx) => unpublishContents(tx, actor, SITE, ids));

async function declaration() {
  const [row] = await db
    .select({ by: sites.massUnpublishDeclaredBy, at: sites.massUnpublishDeclaredAt })
    .from(sites)
    .where(eq(sites.id, SITE));
  return row;
}

async function liveIds(): Promise<number[]> {
  const ids: number[] = [];
  for (const id of [1, 2, 3]) {
    if ((await liveVersion(db, SITE, id)) !== undefined) ids.push(id);
  }
  return ids;
}

async function runBuild(render: object, publish?: object) {
  const fake = fakeRuntime(
    publish === undefined
      ? { render: { exitCode: 10, file: render } }
      : { render: { file: render }, publish: { file: publish } },
  );
  await createBuildTask({ db, runtime: fake.runtime, settings })({ siteId: SITE }, helpers());
  return fake.started[0]?.env;
}

describe('despublicação em lote', () => {
  it('despublica os escolhidos e grava a declaração (quem e quando), sem 301', async () => {
    const redirectsBefore = await db.select().from(redirects);

    const result = await unpublishBatch([1, 2]);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.unpublished.map((u) => u.contentId)).toEqual([1, 2]);
    expect(await liveIds()).toEqual([3]);
    expect(await declaration()).toEqual({
      by: 'revisor@orakel.local',
      at: result.value.declaredAt,
    });
    expect(await db.select().from(redirects)).toEqual(redirectsBefore);
  });

  it('se um conteúdo é recusado, nada é gravado', async () => {
    const versionsBefore = await db.select().from(contentVersions);

    const result = await unpublishBatch([1, 99, 2]);

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found', path: ['contentIds', 1] }],
    });
    expect(await db.select().from(contentVersions)).toEqual(versionsBefore);
    expect(await liveIds()).toEqual([1, 2, 3]);
    expect(await declaration()).toEqual({ by: null, at: null });
  });

  it('exige content.publish e recusa a lista vazia, sem gravar nada', async () => {
    expect(await unpublishBatch([1], editor)).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await unpublishBatch([])).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.empty_batch' }],
    });
    expect(await liveIds()).toEqual([1, 2, 3]);
    expect(await declaration()).toEqual({ by: null, at: null });
  });
});

describe('a declaração e o build', () => {
  it('loadBuildTarget expõe a declaração, e o build passa ALLOW_MASS_UNPUBLISH', async () => {
    expect(await loadBuildTarget(db, SITE)).toMatchObject({ massUnpublishDeclaredAt: null });
    const result = await unpublishBatch([1, 2]);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));

    expect(await loadBuildTarget(db, SITE)).toMatchObject({
      massUnpublishDeclaredAt: result.value.declaredAt,
    });
    const env = await runBuild(renderOk(SITE, []), publishOk(SITE));
    expect(env).toMatchObject({ ALLOW_MASS_UNPUBLISH: 'true' });
  });

  it('o build com sucesso consome a declaração; o próximo volta a ter a trava', async () => {
    expect(await unpublishBatch([1, 2])).toMatchObject({ ok: true });

    await runBuild(renderOk(SITE, []), publishOk(SITE));

    expect(await declaration()).toEqual({ by: null, at: null });
    const env = await runBuild(renderOk(SITE, []), publishOk(SITE));
    expect(env).toMatchObject({ ALLOW_MASS_UNPUBLISH: 'false' });
  });

  it('o build com falha mantém a declaração', async () => {
    const result = await unpublishBatch([1, 2]);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));

    await runBuild(failedFile('permanent', 'Orçamento de JS: artigo 18 kB', SITE));

    expect(await db.select({ status: builds.status }).from(builds)).toEqual([{ status: 'failed' }]);
    expect(await declaration()).toEqual({
      by: 'revisor@orakel.local',
      at: result.value.declaredAt,
    });
  });

  it('o sucesso não consome uma declaração mais nova que a que o build usou', async () => {
    const seen = await declareMassUnpublish(db, SITE, 'a@orakel.local', new Date(1_000));
    const newer = await declareMassUnpublish(db, SITE, 'b@orakel.local', new Date(2_000));

    await db.transaction((tx) =>
      recordBuild(
        tx,
        {
          siteId: SITE,
          release: 'local',
          jobId: undefined,
          attempt: 1,
          startedAt: new Date(),
          massUnpublishDeclaredAt: seen,
        },
        {
          status: 'ok',
          render: renderOk(SITE, []),
          publish: publishOk(SITE),
          renderMs: 1,
          publishMs: 1,
        } as BuildOutcome,
      ),
    );

    expect(await declaration()).toEqual({ by: 'b@orakel.local', at: newer });
  });

  it('sem a declaração, a falha permanente da trava pausa o site com o motivo', async () => {
    await runBuild(renderOk(SITE, []), publishOk(SITE));
    // Despublicar 2 dos 3 conteúdos um a um, sem o lote: nada é declarado.
    for (const id of [1, 2]) {
      expect(await db.transaction((tx) => unpublishContent(tx, revisor, SITE, id))).toMatchObject({
        ok: true,
      });
    }
    const reason =
      'Trava de segurança: 4 páginas contra 12 da versão ativa (queda de 67%, tolerância 20%).';

    const env = await runBuild(failedFile('permanent', reason, SITE));

    expect(env).toMatchObject({ ALLOW_MASS_UNPUBLISH: 'false', ACTIVE_PAGE_COUNT: '12' });
    const [site] = await db
      .select({ state: sites.state, pausedReason: sites.pausedReason })
      .from(sites)
      .where(eq(sites.id, SITE));
    expect(site).toEqual({ state: 'pausado', pausedReason: `render: ${reason}` });
  });
});
