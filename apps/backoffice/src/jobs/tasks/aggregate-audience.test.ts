import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ConsolidateModule from '../../domain/audience/consolidate.ts';

import type { Db } from '../../db/client.ts';
import type { ConsolidationResult } from '../../domain/audience/consolidate.ts';
import { AeSqlError, memoryAeSqlClient } from '../../domain/audience/sql.ts';
import {
  createAggregateAudienceTask,
  type AggregateAudienceTaskDeps,
} from './aggregate-audience.ts';

// A consolidação (SQL e transação) tem o próprio teste; aqui só a janela, o log e o ping.
const mocks = vi.hoisted(() => ({ consolidateAudience: vi.fn() }));
vi.mock('../../domain/audience/consolidate.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ConsolidateModule>()),
  consolidateAudience: mocks.consolidateAudience,
}));

const AE_URL = 'http://orakel:orakel-local@clickhouse:8123';

let messages: string[];
let helpers: JobHelpers;
let heartbeat: ReturnType<typeof vi.fn<(name: string) => Promise<boolean>>>;

const db = {} as Db;
const ae = memoryAeSqlClient();

function task(overrides: Partial<AggregateAudienceTaskDeps> = {}) {
  return createAggregateAudienceTask({
    db,
    aeClient: () => ae,
    now: () => new Date('2026-11-04T15:00:00Z'),
    heartbeat,
    ...overrides,
  });
}

function windowOf(call = 0) {
  return (mocks.consolidateAudience.mock.calls[call] as [Db, unknown, unknown])[2];
}

beforeEach(() => {
  messages = [];
  const log = (message: string) => messages.push(message);
  helpers = { logger: { info: vi.fn(log), warn: vi.fn(log) } } as unknown as JobHelpers;
  heartbeat = vi.fn(() => Promise.resolve(true));
  mocks.consolidateAudience
    .mockReset()
    .mockImplementation((_db, _ae, window: ConsolidationResult['window']) =>
      Promise.resolve({ window, siteRows: 4, articleRows: 12, unknownSites: [] }),
    );
});

describe('aggregate-audience', () => {
  it('consolida ontem e hoje de São Paulo com o cliente do AE e pinga o heartbeat', async () => {
    await task()({}, helpers);

    expect(mocks.consolidateAudience).toHaveBeenCalledWith(db, ae, {
      from: '2026-11-03',
      to: '2026-11-04',
    });
    expect(heartbeat).toHaveBeenCalledExactlyOnceWith('aggregate-audience');
    expect(messages).toEqual([
      'audiência consolidada de 2026-11-03 a 2026-11-04: 4 dia(s) de site, 12 dia(s) de artigo',
    ]);
  });

  it('às 23h30 de São Paulo, a janela ainda termina no dia local (já é amanhã em UTC)', async () => {
    await task({ now: () => new Date('2026-11-05T02:30:00Z') })({}, helpers);
    expect(windowOf()).toEqual({ from: '2026-11-03', to: '2026-11-04' });
  });

  it('às 00h30 de São Paulo, a janela já passa para o dia novo', async () => {
    await task({ now: () => new Date('2026-11-05T03:30:00Z') })({}, helpers);
    expect(windowOf()).toEqual({ from: '2026-11-04', to: '2026-11-05' });
  });

  it('falha do AE lança, para o Graphile Worker repetir, e não pinga', async () => {
    mocks.consolidateAudience.mockRejectedValue(new AeSqlError('ClickHouse indisponível'));

    await expect(task()({}, helpers)).rejects.toThrow(AeSqlError);
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('sem AE_SQL_*: avisa, não consolida nem pinga', async () => {
    await task({ aeClient: () => undefined })({}, helpers);

    expect(mocks.consolidateAudience).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^audiência não consolidada: .*AE_SQL_/);
  });

  it('monta o cliente do AE só na primeira execução', async () => {
    const aeClient = vi.fn(() => ae);
    const run = task({ aeClient });
    expect(aeClient).not.toHaveBeenCalled();

    await run({}, helpers);
    await run({}, helpers);
    expect(aeClient).toHaveBeenCalledOnce();
  });

  it('sites fora do cadastro: avisa só os IDs', async () => {
    mocks.consolidateAudience.mockImplementation(
      (_db, _ae, window: ConsolidationResult['window']) =>
        Promise.resolve({ window, siteRows: 1, articleRows: 0, unknownSites: ['antigo', 'teste'] }),
    );
    await task()({}, helpers);
    expect(messages).toContain('audiência de sites fora do cadastro ignorada: antigo, teste');
  });

  it('logs sem IP, sid nem URL do AE', async () => {
    mocks.consolidateAudience.mockImplementation(
      (_db, _ae, window: ConsolidationResult['window']) =>
        Promise.resolve({ window, siteRows: 1, articleRows: 1, unknownSites: ['antigo'] }),
    );
    await task()({}, helpers);
    await task({ aeClient: () => undefined })({}, helpers);

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(message).not.toMatch(/\bsid\b/i);
      expect(message).not.toMatch(/https?:\/\//);
      expect(message).not.toContain(AE_URL);
      expect(message).not.toContain('orakel-local');
    }
  });
});
