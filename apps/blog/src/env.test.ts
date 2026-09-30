import { describe, expect, it } from 'vitest';

import { buildEnv, sourceEnv } from './env.ts';

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
      sourceEnv({
        CONTENT_SOURCE: 'api',
        EXPORT_API_URL: 'http://backoffice-web:3000',
        EXPORT_BUILD_TOKEN: TOKEN,
      }),
    ).toMatchObject({ CONTENT_SOURCE: 'api' });
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
