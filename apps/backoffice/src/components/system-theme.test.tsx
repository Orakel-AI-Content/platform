// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SystemTheme } from './system-theme.tsx';

// Tema do sistema montado no cliente (#283): o <html> sem classe de tema a recebe pelo sistema.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.className = '';
});

describe('tema do sistema no cliente', () => {
  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)('sem cookie, põe a classe da preferência (escuro: %s)', (prefersDark, mode) => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: prefersDark } as MediaQueryList);
    document.documentElement.className = 'font-var';
    render(<SystemTheme />);
    expect(document.documentElement.className).toBe(`font-var ${mode}`);
  });
});
