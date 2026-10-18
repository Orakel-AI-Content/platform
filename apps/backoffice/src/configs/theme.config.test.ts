// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyStoredTheme,
  applyThemeChoice,
  applyThemeClass,
  cookieThemeMode,
  parseThemeMode,
  resolveTheme,
  THEME_COOKIE_SCRIPT,
  themeCookie,
} from './theme.config';

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

describe('themeCookie', () => {
  it('grava o modo fixo por um ano, no site inteiro', () => {
    expect(themeCookie('dark')).toBe('orakel-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax');
    expect(themeCookie('light')).toBe('orakel-theme=light; Path=/; Max-Age=31536000; SameSite=Lax');
  });

  it('no sistema, apaga o cookie', () => {
    expect(themeCookie('system')).toBe('orakel-theme=; Path=/; Max-Age=0; SameSite=Lax');
  });
});

describe('resolveTheme', () => {
  it('o modo fixo vale, qualquer que seja a preferência do sistema', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('no sistema, vale a preferência', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('applyThemeClass', () => {
  it('troca a classe de tema e preserva as outras', () => {
    const root = document.createElement('html');
    root.className = 'font-var light';

    applyThemeClass(root.classList, 'dark');
    expect(root.className).toBe('font-var dark');

    applyThemeClass(root.classList, 'light');
    expect(root.className).toBe('font-var light');
  });
});

describe('applyThemeChoice', () => {
  // O happy-dom não apaga cookie com Max-Age=0: confere-se o que é gravado (a remoção de
  // verdade fica com o theme.spec.ts).
  function record(): string[] {
    const writes: string[] = [];
    vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
      writes.push(value);
    });
    return writes;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.className = '';
  });

  it('modo fixo: grava o cookie e põe a classe, ignorando o sistema', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const writes = record();
    applyThemeChoice('light');
    expect(writes).toEqual([themeCookie('light')]);
    expect(document.documentElement.className).toBe('light');
  });

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)(
    'sistema: apaga o cookie e põe a classe da preferência (escuro: %s)',
    (dark, mode) => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: dark } as MediaQueryList);
      document.documentElement.className = dark ? 'light' : 'dark';
      const writes = record();
      applyThemeChoice('system');
      expect(writes).toEqual([themeCookie('system')]);
      expect(document.documentElement.className).toBe(mode);
    },
  );
});

describe('THEME_COOKIE_SCRIPT', () => {
  // Roda o script como o <head> da global-error: cookie lido pelo getter, sistema pelo matchMedia.
  function run(cookie: string, prefersDark: boolean): string {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookie);
    vi.stubGlobal('matchMedia', () => ({ matches: prefersDark }) as MediaQueryList);
    // O happy-dom não executa <script>: o texto do script roda como função, que é o que ele é.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const apply = new Function(THEME_COOKIE_SCRIPT) as () => void;
    apply();
    return document.documentElement.className;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.className = '';
  });

  it.each([
    ['orakel-theme=light', true, 'light'],
    ['outro=1; orakel-theme=dark', false, 'dark'],
  ] as const)('cookie válido vale, contra o sistema (%s)', (cookie, prefersDark, mode) => {
    expect(run(cookie, prefersDark)).toBe(mode);
  });

  it.each([
    ['', true, 'dark'],
    ['', false, 'light'],
    ['orakel-theme=system', true, 'dark'],
    ['orakel-theme=Dark', false, 'light'],
    ['meu-orakel-theme=dark', false, 'light'],
  ] as const)(
    'cookie ausente ou desconhecido cai no sistema ("%s")',
    (cookie, prefersDark, mode) => {
      expect(run(cookie, prefersDark)).toBe(mode);
    },
  );
});

describe('cookieThemeMode', () => {
  it('lê o modo entre os cookies', () => {
    expect(cookieThemeMode('orakel-theme=dark')).toBe('dark');
    expect(cookieThemeMode('outro=1; orakel-theme=light; mais=2')).toBe('light');
  });

  it('ausente, desconhecido ou de outro cookie vale como sistema', () => {
    expect(cookieThemeMode('')).toBeUndefined();
    expect(cookieThemeMode('orakel-theme=system')).toBeUndefined();
    expect(cookieThemeMode('meu-orakel-theme=dark')).toBeUndefined();
  });
});

describe('applyStoredTheme', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.className = '';
  });

  // Como a global-error montada no cliente: o React deixou o <html> sem classe.
  it.each([
    ['orakel-theme=light', true, 'light'],
    ['orakel-theme=dark', false, 'dark'],
    ['', true, 'dark'],
    ['', false, 'light'],
    ['orakel-theme=Dark', false, 'light'],
  ] as const)('cookie "%s" (sistema escuro: %s) põe %s', (cookie, prefersDark, mode) => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookie);
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: prefersDark } as MediaQueryList);
    applyStoredTheme();
    expect(document.documentElement.className).toBe(mode);
  });
});
