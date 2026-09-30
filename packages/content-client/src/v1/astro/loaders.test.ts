import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { LoaderContext } from 'astro/loaders';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readFixture, startServer, TOKEN } from '../test-server.ts';
import { SnapshotReadError, snapshotLoaders } from './loaders.ts';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

/** Contexto mínimo do Content Layer: store em memória, parseData identidade. */
function fakeContext() {
  const data = new Map<string, unknown>();
  const store = {
    clear: () => data.clear(),
    set: ({ id, data: value }: { id: string; data: unknown }) => void data.set(id, value),
    keys: () => [...data.keys()],
  };
  const context = {
    store,
    parseData: ({ data: value }: { data: unknown }) => Promise.resolve(value),
    logger: { info: vi.fn() },
  } as unknown as LoaderContext;
  return { context, data };
}

describe('snapshotLoaders', () => {
  it('alimenta todas as coleções com UMA leitura e grava o metaFile', async () => {
    const body = await readFixture('exemplo-a');
    let requests = 0;
    const server = await startServer(() => {
      requests += 1;
      return { body };
    });
    close = server.close;
    const metaFile = path.join(
      await mkdtemp(path.join(tmpdir(), 'content-client-')),
      'meta',
      'snapshot.json',
    );
    const loaders = snapshotLoaders({
      baseUrl: server.baseUrl,
      site: 'exemplo-a',
      token: TOKEN,
      metaFile,
    });

    const contents = fakeContext();
    const authors = fakeContext();
    const config = fakeContext();
    await Promise.all([
      loaders.contents.load(contents.context),
      loaders.authors.load(authors.context),
      loaders.config.load(config.context),
    ]);

    expect(requests).toBe(1);
    expect([...contents.data.keys()]).toEqual(['1', '2', '3']);
    expect([...authors.data.keys()]).toEqual(['1', '2']);
    expect(config.data.get('config')).toMatchObject({ siteId: 'exemplo-a' });

    const meta = JSON.parse(await readFile(metaFile, 'utf8')) as {
      header: { site: string };
      end: { counts: { content: number } };
    };
    expect(meta.header.site).toBe('exemplo-a');
    expect(meta.end.counts.content).toBe(3);
  });

  it('falha de leitura vira SnapshotReadError com a classificação', async () => {
    const server = await startServer(() => ({ status: 503 }));
    close = server.close;
    const loaders = snapshotLoaders({ baseUrl: server.baseUrl, site: 'exemplo-a', token: TOKEN });
    const error = await loaders.contents.load(fakeContext().context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnapshotReadError);
    expect((error as SnapshotReadError).kind).toBe('transient');
  });
});
