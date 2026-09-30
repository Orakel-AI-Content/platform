import { describe, expect, it } from 'vitest';

import { canIssueSession, NO_SESSION_COUNTRIES, SESSION_IDLE_MS } from './session.ts';

describe('sessão', () => {
  it('cobre EEE (30 países), Reino Unido e Suíça', () => {
    expect(NO_SESSION_COUNTRIES.size).toBe(32);
  });

  it.each(['BR', 'US', 'AR', 'MX'])('emite sessão para %s', (country) => {
    expect(canIssueSession(country)).toBe(true);
  });

  it.each(['DE', 'PT', 'FR', 'NO', 'IS', 'LI', 'GB', 'CH'])(
    'não emite sessão para %s',
    (country) => {
      expect(canIssueSession(country)).toBe(false);
    },
  );

  it.each([undefined, 'XX', 'T1', 'br', 'BRA', ''])('na dúvida não emite (%s)', (country) => {
    expect(canIssueSession(country)).toBe(false);
  });

  it('expira após 30 minutos sem atividade', () => {
    expect(SESSION_IDLE_MS).toBe(1_800_000);
  });
});
