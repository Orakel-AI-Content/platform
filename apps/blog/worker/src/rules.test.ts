import { describe, expect, it } from 'vitest';

import { isBot } from './bot.ts';
import { resolveCountry } from './country.ts';
import { deviceClass } from './device.ts';
import { isSameOrigin } from './origin.ts';
import { CHROME_ANDROID, CHROME_DESKTOP } from './test-builders.ts';

describe('isBot', () => {
  it.each([
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['GPTBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2)'],
    ['headless', 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0.0.0 Safari/537.36'],
    ['sem user-agent', null],
    ['user-agent vazio', '  '],
  ])('marca %s como bot', (_, userAgent) => {
    expect(isBot(userAgent)).toBe(true);
  });

  it.each([CHROME_DESKTOP, CHROME_ANDROID])('deixa passar navegador real', (userAgent) => {
    expect(isBot(userAgent)).toBe(false);
  });
});

describe('isSameOrigin', () => {
  const site = 'https://exemplo-a.com.br';

  it('decide pelo Sec-Fetch-Site quando ele existe', () => {
    expect(isSameOrigin({ secFetchSite: 'same-origin', origin: null }, site)).toBe(true);
    expect(isSameOrigin({ secFetchSite: 'cross-site', origin: site }, site)).toBe(false);
    expect(isSameOrigin({ secFetchSite: 'same-site', origin: site }, site)).toBe(false);
  });

  it('sem Sec-Fetch-Site, exige Origin igual ao do site', () => {
    expect(isSameOrigin({ secFetchSite: null, origin: site }, site)).toBe(true);
    expect(isSameOrigin({ secFetchSite: null, origin: 'https://outro.com' }, site)).toBe(false);
    expect(isSameOrigin({ secFetchSite: null, origin: null }, site)).toBe(false);
  });
});

describe('resolveCountry', () => {
  it('usa o país da Cloudflare', () => {
    expect(resolveCountry('BR', null, false)).toBe('BR');
    expect(resolveCountry(undefined, null, false)).toBeUndefined();
    expect(resolveCountry('', null, false)).toBeUndefined();
  });

  it('aceita X-Test-Country só com ALLOW_COUNTRY_OVERRIDE e em formato válido', () => {
    expect(resolveCountry('BR', 'DE', true)).toBe('DE');
    expect(resolveCountry('BR', 'DE', false)).toBe('BR');
    expect(resolveCountry('BR', 'alemanha', true)).toBe('BR');
  });
});

describe('deviceClass', () => {
  it.each([
    [CHROME_DESKTOP, null, 'desktop'],
    [CHROME_ANDROID, null, 'mobile'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', null, 'mobile'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', null, 'tablet'],
    ['Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/140.0.0.0 Safari/537.36', null, 'tablet'],
    ['Mozilla/5.0 (X11; Linux x86_64) Chrome/140', '?1', 'mobile'],
  ])('%s → %s', (userAgent, hint, expected) => {
    expect(deviceClass(userAgent, hint)).toBe(expected);
  });
});
