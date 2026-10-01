import { describe, expect, it } from 'vitest';

import { EXIT_CODES, PublishResultSchema, ResultSchema, exitCodeOf } from './index.ts';

const base = { formatVersion: 1, site: 'exemplo-a', release: 'local', durationMs: 1200 };

describe('result.json', () => {
  it('sucesso traz as mudanças, as contagens e o uso de redirects', () => {
    const parsed = ResultSchema.safeParse({
      ...base,
      status: 'ok',
      pendingChangeIds: [1, 2],
      pages: 12,
      files: 43,
      redirectUsage: {
        static: 0,
        dynamic: 0,
        limits: { static: 2000, dynamic: 100 },
        alert: false,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('falha traz o tipo e a mensagem; versão de formato diferente é recusada', () => {
    const failed = { ...base, status: 'failed', failure: { kind: 'permanent', message: 'trava' } };
    expect(ResultSchema.safeParse(failed).success).toBe(true);
    expect(ResultSchema.safeParse({ ...failed, formatVersion: 2 }).success).toBe(false);
    expect(
      ResultSchema.safeParse({ ...failed, failure: { kind: 'talvez', message: 'x' } }).success,
    ).toBe(false);
  });
});

describe('publish.json', () => {
  it('sucesso traz a versão publicada e a chave do build-cache', () => {
    const parsed = PublishResultSchema.safeParse({
      formatVersion: 1,
      status: 'ok',
      site: 'exemplo-a',
      target: 'local',
      versionId: '20260930T210249Z-4032e8d6',
      cacheKey: 'exemplo-a/20260930T210249Z-4032e8d6.tar.gz',
      durationMs: 2944,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('códigos de saída', () => {
  it('concordam com o status e o tipo da falha', () => {
    expect(exitCodeOf({ status: 'ok' })).toBe(EXIT_CODES.ok);
    expect(exitCodeOf({ status: 'failed', failure: { kind: 'permanent', message: 'x' } })).toBe(10);
    expect(exitCodeOf({ status: 'failed', failure: { kind: 'transient', message: 'x' } })).toBe(20);
  });
});
