import { beforeAll, describe, expect, it } from 'vitest';
import type { Snapshot } from '@orakel/content-model/v1';
import { rss } from './rss.ts';
import { changed, fixture } from './test-snapshots.ts';

let a: Snapshot;
beforeAll(async () => {
  a = await fixture('exemplo-a');
});

describe('rss', () => {
  it('gera o feed dos artigos da fixture', () => {
    const feed = rss(a);
    expect(feed.path).toBe('/rss.xml');
    expect(feed.xml).toMatchSnapshot();
  });

  it('ordena pelo mais recente, limita e usa guid estável pelo ID', () => {
    const { xml } = rss(a, 1);
    expect(xml.match(/<item>/g)).toHaveLength(1);
    expect(xml).toContain('<title>Uma rotina da manhã possível</title>');
    expect(xml).toContain('<guid isPermaLink="false">exemplo-a:2</guid>');
    expect(xml).toContain('<lastBuildDate>Tue, 22 Sep 2026 11:00:00 GMT</lastBuildDate>');
    expect(xml).not.toContain('Quem somos');
  });

  it('escapa o texto e não inventa data sem artigos', () => {
    const snapshot = changed(a, (copy) => {
      copy.config.name = 'Pão & Café <b>';
      copy.contents = copy.contents.filter((content) => content.kind === 'page');
    });
    const { xml } = rss(snapshot);
    expect(xml).toContain('<title>Pão &amp; Café &lt;b&gt;</title>');
    expect(xml).not.toContain('<item>');
    expect(xml).not.toContain('lastBuildDate');
  });
});
