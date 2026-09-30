import { describe, expect, it } from 'vitest';
import type { Redirect } from '@orakel/content-model/v1';
import { isDynamicRedirect, redirectUsage, redirectsFile } from './redirects.ts';

const redirect = (id: number, from: string): Redirect => ({
  id,
  from,
  to: '/destino/',
  status: 301,
  origin: 'manual',
});

const many = (count: number, from: (i: number) => string, offset = 0) =>
  Array.from({ length: count }, (_, i) => redirect(offset + i + 1, from(i)));

describe('_redirects', () => {
  it('classifica estático e dinâmico pela origem', () => {
    expect(isDynamicRedirect({ from: '/antigo/' })).toBe(false);
    expect(isDynamicRedirect({ from: '/blog/*' })).toBe(true);
    expect(isDynamicRedirect({ from: '/post/:slug/' })).toBe(true);
  });

  it('gera uma linha por redirect, em ordem de ID', () => {
    const result = redirectsFile({
      redirects: [redirect(2, '/b/'), { ...redirect(1, '/a/*'), status: 302 }],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        path: '/_redirects',
        content: '/a/* /destino/ 302\n/b/ /destino/ 301\n',
        usage: { static: 1, dynamic: 1, limits: { static: 2000, dynamic: 100 }, alert: false },
      },
    });
  });

  it('alerta a partir de 75% de um dos limites', () => {
    expect(redirectUsage(many(1499, (i) => `/s${i}/`)).alert).toBe(false);
    expect(redirectUsage(many(1500, (i) => `/s${i}/`)).alert).toBe(true);
    expect(redirectUsage(many(75, (i) => `/d${i}/*`)).alert).toBe(true);
  });

  it('falha acima dos limites, apontando cada um', () => {
    const redirects = [...many(2001, (i) => `/s${i}/`), ...many(101, (i) => `/d${i}/*`, 3000)];
    const result = redirectsFile({ redirects });
    expect(result.ok ? [] : result.issues.map((issue) => issue.code)).toEqual([
      'redirect.limit-static',
      'redirect.limit-dynamic',
    ]);
  });
});
