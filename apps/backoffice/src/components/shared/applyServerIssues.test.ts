import { describe, expect, it, vi } from 'vitest';

import { applyServerIssues } from './applyServerIssues.ts';

// Recusa do servidor no formulário: com `path` vira erro do campo, sem `path` vai ao resumo.

describe('applyServerIssues', () => {
  it('marca os campos com foco só no primeiro e devolve as mensagens sem campo', () => {
    const setError = vi.fn();
    const top = applyServerIssues(setError, [
      { path: [], message: 'Conflito de versão.' },
      { path: ['blocks', 0, 'content'], message: 'Obrigatório.' },
      { path: ['title'], message: 'Muito longo.' },
    ]);
    expect(top).toEqual(['Conflito de versão.']);
    expect(setError.mock.calls).toEqual([
      ['blocks.0.content', { type: 'server', message: 'Obrigatório.' }, { shouldFocus: true }],
      ['title', { type: 'server', message: 'Muito longo.' }, { shouldFocus: false }],
    ]);
  });

  it('sem issues não marca nada', () => {
    const setError = vi.fn();
    expect(applyServerIssues(setError, [])).toEqual([]);
    expect(setError).not.toHaveBeenCalled();
  });
});
