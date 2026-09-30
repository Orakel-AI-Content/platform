import { beforeAll, describe, expect, it } from 'vitest';
import type { Snapshot } from '@orakel/content-model/v1';
import { headersFile } from './headers.ts';
import { fixture, indexable } from './test-snapshots.ts';

let a: Snapshot;
beforeAll(async () => {
  a = await fixture('exemplo-a');
});

describe('_headers', () => {
  it('site não indexável: noindex em tudo, segurança e immutable só nos caminhos com hash', () => {
    expect(headersFile(a)).toMatchSnapshot();
  });

  it('site indexável: sem X-Robots-Tag e sem regra de cache em /*', () => {
    const file = headersFile(indexable(a));
    expect(file).not.toContain('X-Robots-Tag');
    expect(file.split('/_astro/*')[0]).not.toContain('Cache-Control');
  });
});
