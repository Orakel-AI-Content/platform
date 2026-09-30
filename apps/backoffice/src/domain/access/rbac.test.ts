import { describe, expect, it } from 'vitest';

import { ROLES } from '../../db/schema/index.ts';
import { can, PERMISSIONS, requireRole, type Action } from './rbac.ts';

const actor = (...roles: (typeof ROLES)[number][]) => ({ email: 'x@orakel.local', roles });

describe('RBAC', () => {
  it('toda pessoa com papel vê os sites', () => {
    for (const role of ROLES) expect(can(actor(role), 'site.read')).toBe(true);
  });

  it.each<[Action, string[]]>([
    ['site.configure', ['admin', 'operacao']],
    ['content.write', ['admin', 'editor']],
    ['content.publish', ['admin', 'revisor']],
    ['operations.run', ['admin', 'operacao']],
    ['release.promote', ['admin', 'operacao']],
  ])('%s só para %s (matriz proposta)', (action, allowed) => {
    for (const role of ROLES) expect(can(actor(role), action)).toBe(allowed.includes(role));
  });

  it('sem papel, nada', () => {
    expect(can(actor(), 'site.read')).toBe(false);
  });

  it('requireRole devolve forbidden como valor', () => {
    expect(requireRole(actor('editor'), 'content.publish')).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(requireRole(actor('revisor'), 'content.publish')).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('cada papel da tabela existe no banco', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });
});
