import { describe, expect, it } from 'vitest';

import { failureKind, snapshotUrl } from './index.ts';

const issue = (code: string) => ({ code, message: '', path: [] });

describe('snapshotUrl', () => {
  it('monta a rota versionada e escapa o site', () => {
    expect(snapshotUrl('http://backoffice-web:3000/', 'exemplo a', 1)).toBe(
      'http://backoffice-web:3000/api/export/v1/sites/exemplo%20a/snapshot',
    );
  });

  it('aponta para o snapshot da visualização com o tipo preview', () => {
    expect(snapshotUrl('http://backoffice-web:3000', 'exemplo-a', 1, 'preview')).toBe(
      'http://backoffice-web:3000/api/export/v1/sites/exemplo-a/preview-snapshot',
    );
  });
});

describe('failureKind', () => {
  it.each([
    'network',
    'http.500',
    'http.503',
    'http.429',
    'truncated',
    'semantic.snapshot-structure',
  ])('%s é transitória', (code) => {
    expect(failureKind([issue(code)])).toBe('transient');
  });

  it.each([
    'http.401',
    'http.403',
    'http.404',
    'json',
    'schema.invalid_type',
    'semantic.references',
  ])('%s é permanente', (code) => {
    expect(failureKind([issue(code)])).toBe('permanent');
  });

  it('uma permanente no meio torna o conjunto permanente; lista vazia também', () => {
    expect(failureKind([issue('network'), issue('schema.x')])).toBe('permanent');
    expect(failureKind([])).toBe('permanent');
  });
});
