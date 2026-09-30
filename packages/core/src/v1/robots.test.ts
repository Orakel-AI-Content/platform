import { beforeAll, describe, expect, it } from 'vitest';
import type { Snapshot } from '@orakel/content-model/v1';
import { robotsTxt } from './robots.ts';
import { changed, fixture } from './test-snapshots.ts';

let a: Snapshot;
beforeAll(async () => {
  a = await fixture('exemplo-a');
});

describe('robotsTxt', () => {
  it('libera tudo, bloqueia o treinamento de IA e aponta o sitemap', () => {
    expect(robotsTxt(a)).toMatchSnapshot();
  });

  it('não bloqueia o rastreio quando o site não é indexável', () => {
    expect(a.config.indexavel).toBe(false);
    expect(robotsTxt(a)).toMatch(/User-agent: \*\nAllow: \/\n/);
  });

  it('aplica a sobrescrita do site e omite o bloco vazio', () => {
    const all = changed(a, (copy) => {
      copy.config.crawlers = {
        allow: [
          'GPTBot',
          'ClaudeBot',
          'CCBot',
          'Bytespider',
          'meta-externalagent',
          'Google-Extended',
          'Applebot-Extended',
        ],
      };
    });
    expect(robotsTxt(all)).not.toContain('Disallow');
    const extra = changed(a, (copy) => {
      copy.config.crawlers = { block: ['NovoBot'] };
    });
    expect(robotsTxt(extra)).toContain('User-agent: NovoBot\nDisallow: /');
  });
});
