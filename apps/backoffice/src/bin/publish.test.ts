import { describe, expect, it } from 'vitest';

import { BUILD_MAX_ATTEMPTS, verdict, type AttemptRow } from './publish.ts';

const base: AttemptRow = {
  attempt: 1,
  status: 'na_fila',
  currentStage: null,
  failedStage: null,
  failureKind: null,
  failureMessage: null,
  versionId: null,
  release: null,
};

describe('local:publish: situação do build pela tentativa mais recente', () => {
  it('espera enquanto não há linha, na fila ou rodando', () => {
    expect(verdict(undefined).kind).toBe('waiting');
    expect(verdict(base).kind).toBe('waiting');
    expect(verdict({ ...base, status: 'rodando', currentStage: 'render' })).toEqual({
      kind: 'waiting',
      note: 'tentativa 1 rodando (render)',
    });
  });

  it('ok encerra com a versão publicada', () => {
    expect(verdict({ ...base, status: 'ok', versionId: 'v-1', release: '1.2.3' })).toEqual({
      kind: 'ok',
      versionId: 'v-1',
      release: '1.2.3',
    });
  });

  it('falha permanente encerra com o motivo gravado', () => {
    const result = verdict({
      ...base,
      status: 'failed',
      failedStage: 'render',
      failureKind: 'permanent',
      failureMessage: 'conteúdo inválido',
    });
    expect(result).toEqual({
      kind: 'failed',
      message: 'build falhou na etapa render, tentativa 1: conteúdo inválido',
    });
  });

  it('falha transitória com tentativa restante espera a repetição', () => {
    const result = verdict({
      ...base,
      status: 'failed',
      attempt: 2,
      failedStage: 'publish',
      failureKind: 'transient',
      failureMessage: 'edge-local fora',
    });
    expect(result.kind).toBe('waiting');
  });

  it('falha transitória na última tentativa encerra', () => {
    const result = verdict({
      ...base,
      status: 'failed',
      attempt: BUILD_MAX_ATTEMPTS,
      failedStage: 'publish',
      failureKind: 'transient',
      failureMessage: 'edge-local fora',
    });
    expect(result).toEqual({
      kind: 'failed',
      message: 'build falhou na etapa publish, tentativa 5: edge-local fora',
    });
  });

  it('cancelado encerra como falha', () => {
    expect(verdict({ ...base, status: 'cancelado', attempt: 3 })).toEqual({
      kind: 'failed',
      message: 'build cancelado na tentativa 3',
    });
  });
});
