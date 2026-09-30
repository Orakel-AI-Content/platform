import { describe, expect, it } from 'vitest';
import { escapeXml } from './xml.ts';

describe('escapeXml', () => {
  it('escapa os cinco caracteres e remove os de controle', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>\u0000\u000B`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;',
    );
  });
});
