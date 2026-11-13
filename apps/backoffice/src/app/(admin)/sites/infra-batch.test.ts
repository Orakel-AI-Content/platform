import { describe, expect, it } from 'vitest';

import type { Role } from '@/db/schema/index.ts';

import { showsReapplyOutdated } from './infra-batch.ts';

// Quem vê "Reaplicar nos desatualizados" na lista de sites (workspace#98).

const actor = (role: Role) => ({ email: `${role}@orakel.local`, roles: [role] });
const drift = (status: 'em_dia' | 'desatualizado' | null) => ({
  infraDrift: { status, summary: null, checkedAt: null, error: null },
});
const outdated = [drift('em_dia'), drift('desatualizado')];

describe('showsReapplyOutdated', () => {
  it('admin e operação veem com site desatualizado; editor e revisor não', () => {
    expect(showsReapplyOutdated(actor('admin'), outdated, null)).toBe(true);
    expect(showsReapplyOutdated(actor('operacao'), outdated, null)).toBe(true);
    expect(showsReapplyOutdated(actor('editor'), outdated, null)).toBe(false);
    expect(showsReapplyOutdated(actor('revisor'), outdated, null)).toBe(false);
  });

  it('sem site desatualizado, ninguém vê', () => {
    expect(showsReapplyOutdated(actor('admin'), [drift('em_dia'), drift(null)], null)).toBe(false);
  });

  it('com o lote aplicando, some; à espera da confirmação ou fechado, aparece', () => {
    const operacao = actor('operacao');
    expect(showsReapplyOutdated(operacao, outdated, { state: 'aplicando' })).toBe(false);
    for (const state of [
      'planejando',
      'aguardando_confirmacao',
      'concluido',
      'interrompido',
    ] as const) {
      expect(showsReapplyOutdated(operacao, outdated, { state })).toBe(true);
    }
  });
});
