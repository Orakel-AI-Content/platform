import { describe, expect, it } from 'vitest';

import { buildEnv, previewEnv } from './env.ts';

const TOKEN = 'x'.repeat(32);

describe('env', () => {
  it('aceita fixture sem os campos da API', () => {
    expect(buildEnv({ CONTENT_SOURCE: 'fixture', SITE_ID: 'exemplo-a' })).toEqual({
      CONTENT_SOURCE: 'fixture',
      SITE_ID: 'exemplo-a',
    });
  });

  it('exige URL e token com api', () => {
    expect(() => buildEnv({ CONTENT_SOURCE: 'api', SITE_ID: 'exemplo-a' })).toThrow(
      /EXPORT_API_URL.*EXPORT_BUILD_TOKEN/,
    );
    expect(
      previewEnv({
        CONTENT_SOURCE: 'api',
        EXPORT_API_URL: 'http://backoffice-web:3000',
        EXPORT_PREVIEW_TOKEN: TOKEN,
      }),
    ).toMatchObject({ CONTENT_SOURCE: 'api' });
  });

  it('cada consumidor exige só o seu token', () => {
    const api = { CONTENT_SOURCE: 'api', EXPORT_API_URL: 'http://backoffice-web:3000' };
    expect(
      buildEnv({ ...api, SITE_ID: 'exemplo-a', EXPORT_BUILD_TOKEN: TOKEN }),
    ).not.toHaveProperty('EXPORT_PREVIEW_TOKEN');
    expect(() => previewEnv({ ...api, EXPORT_BUILD_TOKEN: TOKEN })).toThrow(/EXPORT_PREVIEW_TOKEN/);
    expect(previewEnv({ ...api, EXPORT_PREVIEW_TOKEN: TOKEN })).not.toHaveProperty(
      'EXPORT_BUILD_TOKEN',
    );
  });

  it('nunca cai na fixture sem CONTENT_SOURCE e nunca mostra valores', () => {
    expect(() => buildEnv({ SITE_ID: 'exemplo-a' })).toThrow(/CONTENT_SOURCE/);
    let message = '';
    try {
      buildEnv({
        CONTENT_SOURCE: 'api',
        SITE_ID: 'x',
        EXPORT_API_URL: 'http://a',
        EXPORT_BUILD_TOKEN: 'segredo-curto',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('EXPORT_BUILD_TOKEN');
    expect(message).not.toContain('segredo-curto');
  });

  it('exige metaFile absoluto', () => {
    expect(() =>
      buildEnv({ CONTENT_SOURCE: 'fixture', SITE_ID: 'x', SNAPSHOT_META_FILE: 'meta.json' }),
    ).toThrow(/absoluto/);
  });
});
