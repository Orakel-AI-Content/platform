import { describe, expect, it } from 'vitest';

import {
  BLOB_FIELDS,
  COLUMNS,
  discardDataPoint,
  pageviewDataPoint,
  referrerHost,
} from './layout.ts';
import { SID } from './test-builders.ts';

describe('layout posicional v1', () => {
  it('fixa cada campo na posição da proposta', () => {
    expect(COLUMNS).toEqual({
      site: 'index1',
      count: 'double1',
      formatVersion: 'blob1',
      type: 'blob2',
      path: 'blob3',
      articleId: 'blob4',
      country: 'blob5',
      device: 'blob6',
      referrerHost: 'blob7',
      sid: 'blob8',
      discardReason: 'blob9',
    });
  });

  it('cabe no limite de 20 blobs do Analytics Engine', () => {
    expect(BLOB_FIELDS.length).toBeLessThanOrEqual(20);
  });

  it('grava o pageview de um artigo posição por posição', () => {
    const point = pageviewDataPoint({
      site: 'exemplo-a',
      path: '/guia-completo/',
      articleId: 1,
      country: 'BR',
      device: 'mobile',
      referrer: 'https://www.google.com/search?q=guia',
      sid: SID,
    });
    expect(point).toEqual({
      indexes: ['exemplo-a'],
      blobs: ['1', 'pageview', '/guia-completo/', '1', 'BR', 'mobile', 'www.google.com', SID, ''],
      doubles: [1],
    });
  });

  it('deixa vazios os campos ausentes (página sem artigo, sem sessão, sem país)', () => {
    const point = pageviewDataPoint({ site: 's', path: '/', device: 'desktop' });
    expect(point.blobs).toEqual(['1', 'pageview', '/', '', '', 'desktop', '', '', '']);
  });

  it('grava o descarte só com site, país e motivo', () => {
    expect(discardDataPoint({ site: 's', reason: 'origin', country: 'US' })).toEqual({
      indexes: ['s'],
      blobs: ['1', 'discard', '', '', 'US', '', '', '', 'origin'],
      doubles: [1],
    });
    expect(discardDataPoint({ site: 's', reason: 'bot' }).blobs[4]).toBe('');
  });
});

describe('referrerHost', () => {
  it.each([
    ['https://www.google.com/search?q=dado+pessoal', 'www.google.com'],
    ['http://exemplo.org:8080/x', 'exemplo.org'],
    ['nao-e-url', ''],
    ['', ''],
    [undefined, ''],
  ])('%s → "%s"', (referrer, host) => {
    expect(referrerHost(referrer)).toBe(host);
  });
});
