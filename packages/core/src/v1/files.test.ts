import { describe, expect, it } from 'vitest';
import { edgeFiles } from './files.ts';
import { changed, fixture } from './test-snapshots.ts';

describe('edgeFiles', () => {
  it.each(['exemplo-a', 'exemplo-b'] as const)('gera os arquivos da borda de %s', async (site) => {
    const result = edgeFiles(await fixture(site));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.map((file) => file.path)).toEqual([
      '/robots.txt',
      '/_redirects',
      '/_headers',
      '/rss.xml',
      '/sitemap.xml',
    ]);
    expect(result.value.redirectUsage.alert).toBe(false);
  });

  it('é determinístico: o mesmo snapshot gera os mesmos arquivos', async () => {
    const snapshot = await fixture('exemplo-a');
    expect(edgeFiles(snapshot)).toEqual(edgeFiles(structuredClone(snapshot)));
  });

  it('junta colisões de rota e excesso de redirects', async () => {
    const snapshot = changed(await fixture('exemplo-a'), (copy) => {
      copy.contents[0]!.slug = 'busca';
      copy.redirects = Array.from({ length: 101 }, (_, i) => ({
        id: i + 1,
        from: `/d${i}/*`,
        to: '/',
        status: 301 as const,
        origin: 'manual' as const,
      }));
    });
    const result = edgeFiles(snapshot);
    expect(result.ok ? [] : result.issues.map((issue) => issue.code)).toEqual([
      'route.reserved-slug',
      'redirect.limit-dynamic',
    ]);
  });

  it('colisão de rota sozinha também falha', async () => {
    const snapshot = changed(await fixture('exemplo-a'), (copy) => {
      copy.contents[0]!.slug = 'tag';
    });
    expect(edgeFiles(snapshot).ok).toBe(false);
  });
});
