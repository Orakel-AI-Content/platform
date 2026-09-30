import { describe, expect, it } from 'vitest';
import { renderHead, serializeJsonLd } from './head.ts';

describe('renderHead', () => {
  it('escapa texto e atributos', () => {
    expect(
      renderHead([
        { tag: 'title', text: 'Pão & <café>' },
        { tag: 'meta', attrs: { name: 'description', content: 'Diz "oi"' } },
        { tag: 'link', attrs: { rel: 'canonical', href: 'https://x.com/?a=1&b=2' } },
      ]),
    ).toBe(
      [
        '<title>Pão &amp; &lt;café&gt;</title>',
        '<meta name="description" content="Diz &quot;oi&quot;">',
        '<link rel="canonical" href="https://x.com/?a=1&amp;b=2">',
      ].join('\n'),
    );
  });

  it('não deixa o JSON-LD fechar o <script>', () => {
    const html = renderHead([{ tag: 'jsonld', data: { headline: '</script><script>alert(1)' } }]);
    expect(html).toBe(
      '<script type="application/ld+json">{"headline":"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)"}</script>',
    );
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('escapa & e os separadores de linha do JavaScript', () => {
    expect(serializeJsonLd({ a: 'x & y\u2028z\u2029' })).toBe('{"a":"x \\u0026 y\\u2028z\\u2029"}');
    expect(JSON.parse(serializeJsonLd({ a: '<b> & c' }))).toEqual({ a: '<b> & c' });
  });
});
