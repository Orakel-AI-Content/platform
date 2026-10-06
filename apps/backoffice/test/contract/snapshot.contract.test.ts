import {
  parseSnapshotLine,
  validateSnapshot,
  type Content,
  type SnapshotLine,
} from '@orakel/content-model/v1';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import type { CONTENT_STATUSES } from '../../src/db/schema/index.ts';
import { contentVersions, type ContentData } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createContent } from '../../src/domain/content/contents.ts';
import {
  openSnapshot,
  snapshotLines,
  type VersionSelection,
} from '../../src/domain/export/snapshot.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Contrato da API de exportação (ADR 0005 da raiz): o snapshot que o Backoffice produz
// passa no schema e na validação semântica do content-model e reproduz as fixtures.

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(() => resetDatabase(db));

async function readSnapshot(
  siteId: string,
  selection: VersionSelection = 'published',
): Promise<SnapshotLine[]> {
  const opened = await openSnapshot(db, siteId, selection);
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues));
  const text = await new Response(opened.value).text();
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const parsed = parseSnapshotLine(JSON.parse(line) as unknown);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
      return parsed.value;
    });
}

function contentsOf(lines: SnapshotLine[]): Content[] {
  return lines.flatMap((line) => (line.type === 'content' ? [line.data] : []));
}

describe.each(['exemplo-a', 'exemplo-b'])('snapshot de %s', (site) => {
  it('passa no content-model e reproduz a fixture (menos as mudanças pendentes)', async () => {
    const fixture = await readFixture(site);
    const imported = await importSnapshot(db, SYSTEM_ACTOR, fixture);
    expect(imported).toEqual({ ok: true, value: { siteId: site } });

    const lines = await readSnapshot(site);
    expect(validateSnapshot(lines).ok).toBe(true);

    const [header, ...rest] = lines;
    expect(header).toMatchObject({ type: 'header', schemaVersion: 1, site });
    expect(header?.type === 'header' && header.pendingChangeIds.length).toBeGreaterThan(0);
    expect(rest).toEqual(fixture.slice(1));
  });
});

describe('API de exportação', () => {
  it('site inexistente é site.not_found, sem abrir transação', async () => {
    expect(await openSnapshot(db, 'nao-existe')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
  });

  it('importar o mesmo site de novo é recusado e não grava nada', async () => {
    const fixture = await readFixture('exemplo-b');
    await importSnapshot(db, SYSTEM_ACTOR, fixture);
    const before = await readSnapshot('exemplo-b');
    expect(await importSnapshot(db, SYSTEM_ACTOR, fixture)).toMatchObject({
      ok: false,
      issues: [{ code: 'site.exists' }],
    });
    expect(await readSnapshot('exemplo-b')).toEqual(before);
  });

  it('snapshotLines conta cada entidade no end', async () => {
    await importSnapshot(db, SYSTEM_ACTOR, await readFixture('exemplo-a'));
    const lines: SnapshotLine[] = [];
    await db.transaction(
      async (tx) => {
        for await (const line of snapshotLines(tx, 'exemplo-a')) lines.push(line);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    expect(lines.at(-1)).toEqual({
      type: 'end',
      counts: { config: 1, author: 2, taxonomy: 3, menu: 1, media: 2, redirect: 1, content: 3 },
    });
  });
});

describe('snapshot de visualização', () => {
  const site = 'exemplo-a';
  let contentId: number;
  let data: ContentData;

  beforeEach(async () => {
    const fixture = await readFixture(site);
    await importSnapshot(db, SYSTEM_ACTOR, fixture);
    const [first] = contentsOf(fixture);
    if (first === undefined) throw new Error('A fixture precisa de um conteúdo');
    ({ id: contentId, ...data } = first);
  });

  async function addVersion(
    status: (typeof CONTENT_STATUSES)[number],
    changes: Partial<ContentData> = {},
  ): Promise<void> {
    await db
      .insert(contentVersions)
      .values({ siteId: site, contentId, version: 2, status, data: { ...data, ...changes } });
  }

  it('traz o rascunho posterior a uma versão publicada; o do build traz a publicada', async () => {
    await addVersion('rascunho', { title: 'Título do rascunho' });

    const preview = contentsOf(await readSnapshot(site, 'latest')).find((c) => c.id === contentId);
    const build = contentsOf(await readSnapshot(site)).find((c) => c.id === contentId);
    expect(preview?.title).toBe('Título do rascunho');
    expect(build).toEqual({ id: contentId, ...data });
  });

  it('traz o conteúdo só em rascunho, que fica fora do build', async () => {
    const created = await db.transaction((tx) =>
      createContent(tx, SYSTEM_ACTOR, site, { ...data, slug: 'so-rascunho' }),
    );
    if (!created.ok) throw new Error(JSON.stringify(created.issues));

    const ids = (lines: SnapshotLine[]) => contentsOf(lines).map((c) => c.id);
    expect(ids(await readSnapshot(site, 'latest'))).toContain(created.value.id);
    expect(ids(await readSnapshot(site))).not.toContain(created.value.id);
  });

  it('deixa de fora o conteúdo cuja última versão é despublicado', async () => {
    await addVersion('despublicado');

    const ids = contentsOf(await readSnapshot(site, 'latest')).map((c) => c.id);
    expect(ids).not.toContain(contentId);
  });

  it('passa no content-model e conta os conteúdos no end', async () => {
    await addVersion('em_revisao', { title: 'Em revisão' });

    const lines = await readSnapshot(site, 'latest');
    expect(validateSnapshot(lines).ok).toBe(true);
    const end = lines.at(-1);
    expect(end?.type === 'end' && end.counts.content).toBe(contentsOf(lines).length);
  });
});
