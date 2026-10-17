import { describe, expect, it } from 'vitest';

import { parseThemeMode } from './theme.config';

describe('parseThemeMode', () => {
  it('aceita light e dark', () => {
    expect(parseThemeMode('light')).toBe('light');
    expect(parseThemeMode('dark')).toBe('dark');
  });

  it('trata ausente ou desconhecido como sistema', () => {
    expect(parseThemeMode(undefined)).toBeUndefined();
    expect(parseThemeMode('')).toBeUndefined();
    expect(parseThemeMode('Dark')).toBeUndefined();
    expect(parseThemeMode('system')).toBeUndefined();
  });
});
