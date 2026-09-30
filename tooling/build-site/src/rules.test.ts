import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EXIT_CODES, ResultSchema, exitCodeOf } from './contract.ts';
import { PublishEnvSchema, RenderEnvSchema, parseEnv } from './env.ts';
import { ClassifiedError, classify } from './failures.ts';
import { versionFromOutput } from './publish/cloudflare.ts';
import { cacheKey } from './publish/build-cache.ts';
import { countArtifact } from './render/count.ts';
import { checkPageDrop } from './render/page-drop.ts';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('classify', () => {
  it('segue a cadeia de cause até achar o kind', () => {
    const inner = Object.assign(new Error('snapshot 401'), { kind: 'permanent' });
    const wrapped = new Error('An unhandled error occurred', {
      cause: new Error('hook', { cause: inner }),
    });
    expect(classify(wrapped)).toEqual({ kind: 'permanent', message: 'snapshot 401' });
  });

  it('sem kind, é transitória; aguenta ciclos e valores que não são Error', () => {
    const a: { cause?: unknown; message: string } = { message: 'a' };
    a.cause = a;
    expect(classify(a).kind).toBe('transient');
    expect(classify('texto')).toEqual({ kind: 'transient', message: 'texto' });
    expect(classify(new ClassifiedError('x', 'permanent')).kind).toBe('permanent');
  });
});

describe('checkPageDrop', () => {
  const base = { tolerance: 0.2, allowMassUnpublish: false };
  it('aceita até a tolerância e o primeiro build', () => {
    expect(() => checkPageDrop({ ...base, pages: 80, activePages: 100 })).not.toThrow();
    expect(() => checkPageDrop({ ...base, pages: 1, activePages: undefined })).not.toThrow();
    expect(() => checkPageDrop({ ...base, pages: 1, activePages: 0 })).not.toThrow();
  });
  it('queda maior que a tolerância é permanente, com os números', () => {
    let error: unknown;
    try {
      checkPageDrop({ ...base, pages: 79, activePages: 100 });
    } catch (caught) {
      error = caught;
    }
    expect(classify(error).kind).toBe('permanent');
    expect((error as Error).message).toContain('79 páginas contra 100');
  });
  it('despublicação declarada libera; tolerância inválida é permanente', () => {
    expect(() =>
      checkPageDrop({ ...base, allowMassUnpublish: true, pages: 0, activePages: 100 }),
    ).not.toThrow();
    expect(() => checkPageDrop({ ...base, tolerance: 1.5, pages: 1, activePages: 1 })).toThrow(
      /fora de 0–1/,
    );
  });
});

describe('countArtifact', () => {
  it('conta páginas sem a 404 e todos os arquivos', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'count-'));
    dirs.push(dir);
    for (const file of [
      'index.html',
      '404.html',
      'a/index.html',
      'a/b/index.html',
      '_astro/x.js',
      'robots.txt',
    ]) {
      await mkdir(join(dir, file, '..'), { recursive: true });
      await writeFile(join(dir, file), '');
    }
    expect(await countArtifact(dir)).toEqual({ pages: 3, files: 6 });
  });
});

describe('contrato', () => {
  it('código de saída concorda com o resultado', () => {
    expect(exitCodeOf({ status: 'ok' })).toBe(EXIT_CODES.ok);
    expect(exitCodeOf({ status: 'failed', failure: { kind: 'permanent', message: 'x' } })).toBe(10);
    expect(exitCodeOf({ status: 'failed', failure: { kind: 'transient', message: 'x' } })).toBe(20);
  });
  it('result.json de falha não precisa dos campos de sucesso', () => {
    expect(
      ResultSchema.parse({
        formatVersion: 1,
        site: 's',
        release: 'r',
        durationMs: 0,
        status: 'failed',
        failure: { kind: 'transient', message: 'x' },
      }).status,
    ).toBe('failed');
  });
  it('chave no build-cache e versão pela saída do wrangler', () => {
    expect(cacheKey('exemplo-a', 'v-1')).toBe('exemplo-a/v-1.tar.gz');
    expect(
      versionFromOutput('{"type":"wrangler-session"}\n\n{"type":"deploy","version_id":"abc"}\n'),
    ).toBe('abc');
    expect(versionFromOutput('{"type":"deploy","version_id":null}')).toBeUndefined();
  });
});

describe('env', () => {
  const render = {
    SITE_ID: 'exemplo-a',
    SITE_DOMAIN: 'exemplo-a.com.br',
    EXPORT_API_URL: 'http://backoffice-web:3000',
    EXPORT_BUILD_TOKEN: 'x'.repeat(32),
  };
  it('render: padrões e números vindos de texto', () => {
    expect(
      parseEnv(
        RenderEnvSchema,
        { ...render, ACTIVE_PAGE_COUNT: '120', PAGE_DROP_TOLERANCE: '0.1' },
        'render',
      ),
    ).toMatchObject({
      RELEASE: 'local',
      ACTIVE_PAGE_COUNT: 120,
      PAGE_DROP_TOLERANCE: 0.1,
      ALLOW_MASS_UNPUBLISH: 'false',
      BUILD_DIR: '/build',
    });
    expect(
      parseEnv(RenderEnvSchema, { ...render, ACTIVE_PAGE_COUNT: '' }, 'render').ACTIVE_PAGE_COUNT,
    ).toBeUndefined();
  });
  it('erro é permanente e nunca mostra valores', () => {
    let error: unknown;
    try {
      parseEnv(RenderEnvSchema, { ...render, EXPORT_BUILD_TOKEN: 'segredo-curto' }, 'render');
    } catch (caught) {
      error = caught;
    }
    expect(classify(error).kind).toBe('permanent');
    expect((error as Error).message).toContain('EXPORT_BUILD_TOKEN');
    expect((error as Error).message).not.toContain('segredo-curto');
  });
  it('publish: cada alvo exige as suas credenciais', () => {
    const s3 = {
      SITE_ID: 'exemplo-a',
      S3_ENDPOINT: 'http://s3:8333',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
    };
    expect(
      parseEnv(
        PublishEnvSchema,
        { ...s3, DEPLOY_TARGET: 'local', EDGE_LOCAL_URL: 'http://edge-local:8787' },
        'publish',
      ),
    ).toMatchObject({ BUILD_CACHE_BUCKET: 'build-cache' });
    expect(() =>
      parseEnv(PublishEnvSchema, { ...s3, DEPLOY_TARGET: 'cloudflare' }, 'publish'),
    ).toThrow(/CLOUDFLARE_API_TOKEN/);
    expect(() => parseEnv(PublishEnvSchema, s3, 'publish')).toThrow(/DEPLOY_TARGET/);
  });
});
