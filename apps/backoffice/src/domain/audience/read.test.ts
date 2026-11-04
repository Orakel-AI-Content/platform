import { describe, expect, it } from 'vitest';

import type { Executor } from '../../db/client.ts';
import type { Actor } from '../access/rbac.ts';
import { audiencePeriodWindow, parseAudiencePeriod, readSiteAudience } from './read.ts';

// Janela e permissão da leitura da audiência (#548); a consulta contra o Postgres fica em
// test/contract/audience-read.contract.test.ts.

describe('audiencePeriodWindow', () => {
  it('às 23h30 de São Paulo o dia corrente é o de São Paulo, não o de UTC', () => {
    // 2026-11-04 23:30 em São Paulo (UTC−3) = 2026-11-05 02:30 UTC.
    const now = new Date('2026-11-05T02:30:00Z');
    expect(audiencePeriodWindow(7, now)).toEqual({ from: '2026-10-29', to: '2026-11-04' });
  });

  it('30 dias inclusivos terminando hoje, atravessando o mês', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    expect(audiencePeriodWindow(30, now)).toEqual({ from: '2026-10-06', to: '2026-11-04' });
  });

  it('logo depois da meia-noite de São Paulo, o dia já virou', () => {
    // 2026-11-05 00:10 em São Paulo = 03:10 UTC.
    expect(audiencePeriodWindow(7, new Date('2026-11-05T03:10:00Z')).to).toBe('2026-11-05');
  });
});

describe('parseAudiencePeriod', () => {
  it('30 dá 30; ausente, inválido ou outro número, 7', () => {
    expect(parseAudiencePeriod('30')).toBe(30);
    expect(parseAudiencePeriod('7')).toBe(7);
    for (const value of [undefined, '', 'abc', '14', '30.0', ['30'], ' 30']) {
      expect(parseAudiencePeriod(value)).toBe(7);
    }
  });
});

describe('readSiteAudience', () => {
  it('sem site.read, nega sem consultar o banco', async () => {
    const db = new Proxy(
      {},
      {
        get() {
          throw new Error('não devia consultar');
        },
      },
    ) as Executor;
    const stranger: Actor = { email: 'x@x', roles: [] };
    const result = await readSiteAudience(db, stranger, 'exemplo-a', { period: 7 });
    expect(result).toEqual({
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão para site.read', path: [] }],
    });
  });
});
