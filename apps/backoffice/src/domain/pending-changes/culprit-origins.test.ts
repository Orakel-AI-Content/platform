import { describe, expect, it } from 'vitest';

import { CULPRIT_ORIGINS } from '@orakel/build-contract';
import type { PendingOrigin } from './record.ts';

// O build grava o conteúdo culpado de uma falha (`failure.culprit` do result.json) com a
// origem de `pending_changes`. A lista do contrato tem de caber em `PendingOrigin`: uma
// origem nova lá, sem par aqui, quebra o typecheck nesta atribuição.
const origins: readonly PendingOrigin[] = CULPRIT_ORIGINS;

describe('origens do culpado do build', () => {
  it('são todas origens de pending_changes', () => {
    expect(origins).toEqual(CULPRIT_ORIGINS);
    expect(new Set(origins).size).toBe(origins.length);
  });
});
