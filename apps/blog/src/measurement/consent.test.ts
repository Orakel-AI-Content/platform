import { describe, expect, it } from 'vitest';

import { CONSENT_DENIED_REGIONS, consentSnippet, ga4Snippet } from './consent.ts';

describe('Consent Mode', () => {
  it('nega no EEE, Reino Unido e Suíça e concede no resto, nessa ordem', () => {
    const snippet = consentSnippet();
    expect(snippet.indexOf('"denied"')).toBeLessThan(snippet.indexOf('"granted"'));
    expect(CONSENT_DENIED_REGIONS).toHaveLength(32);
    for (const region of ['DE', 'NO', 'GB', 'CH']) expect(snippet).toContain(`"${region}"`);
    expect(snippet).not.toContain('"BR"');
    expect(new TextEncoder().encode(snippet).length).toBeLessThan(1024);
  });

  it('GA4 carrega depois do load, com o ID escapado', () => {
    expect(ga4Snippet('G-ABC123')).toMatch(/^addEventListener\('load'/);
    expect(ga4Snippet('G-"x')).toContain('"G-\\"x"');
  });
});
