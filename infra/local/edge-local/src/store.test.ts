import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { Store, createdAtOf, versionId } from './store.ts';
import { makeArchive, removeTree } from './test-archive.ts';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTree));
});

async function store() {
  const dir = await mkdtemp(join(tmpdir(), 'edge-store-'));
  dirs.push(dir);
  return new Store(dir);
}

const at = (minute: number) => new Date(Date.UTC(2026, 8, 30, 15, minute, 0));

describe('IDs', () => {
  it('UTC compacto + 8 hex do conteúdo, ordenáveis', () => {
    const id = versionId(new Date('2026-09-30T15:30:12.345Z'), new Uint8Array([1, 2, 3]));
    expect(id).toMatch(/^20260930T153012Z-[0-9a-f]{8}$/);
    expect(createdAtOf(id)).toBe('2026-09-30T15:30:12Z');
  });
});

describe('Store', () => {
  it('extrai, valida, marca como ativa e lista', async () => {
    const s = await store();
    const id = await s.add('exemplo-a', await makeArchive('exemplo-a', 'A'), at(0));
    await s.setActive('exemplo-a', id);
    expect(await s.list('exemplo-a')).toEqual({
      active: id,
      versions: [{ id, createdAt: createdAtOf(id), files: 7, active: true }],
    });
    expect(await s.sites()).toEqual(['exemplo-a']);
  });

  it('recusa arquivo que não é tar.gz, sem partes ou de outro Worker', async () => {
    const s = await store();
    await expect(s.add('exemplo-a', new TextEncoder().encode('nada'))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      s.add('exemplo-a', await makeArchive('exemplo-a', 'A', { name: 'orakel-outro' })),
    ).rejects.toThrow(/outro Worker/);
    await expect(s.add('Exemplo_A', await makeArchive('exemplo-a', 'A'))).rejects.toMatchObject({
      status: 400,
    });
    expect(await s.ids('exemplo-a')).toEqual([]);
  });

  it('duas publicações no mesmo segundo ficam na ordem em que chegaram', async () => {
    const s = await store();
    const first = await s.add('exemplo-a', await makeArchive('exemplo-a', 'A'), at(5));
    const second = await s.add('exemplo-a', await makeArchive('exemplo-a', 'B'), at(5));
    expect(await s.ids('exemplo-a')).toEqual([second, first]);
    expect(createdAtOf(second)).toBe('2026-09-30T15:05:01Z');
  });

  it('rollback: a pedida, ou a anterior à ativa; 404 quando não há', async () => {
    const s = await store();
    const archive = await makeArchive('exemplo-a', 'A');
    const a = await s.add('exemplo-a', archive, at(0));
    const b = await s.add('exemplo-a', archive, at(1));
    await s.setActive('exemplo-a', b);
    expect(await s.rollbackTarget('exemplo-a')).toBe(a);
    expect(await s.rollbackTarget('exemplo-a', b)).toBe(b);
    await expect(s.rollbackTarget('exemplo-a', '20990101T000000Z-00000000')).rejects.toMatchObject({
      status: 404,
    });
    await s.setActive('exemplo-a', a);
    await expect(s.rollbackTarget('exemplo-a')).rejects.toMatchObject({ status: 404 });
  });

  it('retenção: as mais novas e a ativa, mesmo se antiga', async () => {
    const s = await store();
    const archive = await makeArchive('exemplo-a', 'A');
    const ids = [];
    for (let minute = 0; minute < 4; minute += 1)
      ids.push(await s.add('exemplo-a', archive, at(minute)));
    await s.setActive('exemplo-a', ids[0]!);
    expect(await s.prune('exemplo-a', 2)).toEqual([ids[1]]);
    expect(await s.ids('exemplo-a')).toEqual([ids[3], ids[2], ids[0]]);
  });
});
