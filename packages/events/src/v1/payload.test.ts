import { describe, expect, it } from 'vitest';

import { MAX_BODY_BYTES, parseEventBody, PageviewPayloadSchema } from './payload.ts';
import { buildPageview, SID } from './test-builders.ts';

const codes = (body: string) => {
  const result = parseEventBody(body);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};

describe('parseEventBody', () => {
  it.each([
    ['artigo', buildPageview()],
    ['outra página', buildPageview({ page: { pageType: 'categoria', path: '/categoria/guias/' } })],
    [
      'com referrer e sid',
      buildPageview({ referrer: 'https://www.google.com/search?q=x', sid: SID }),
    ],
  ])('aceita pageview de %s', (_, payload) => {
    expect(parseEventBody(JSON.stringify(payload))).toEqual({ ok: true, value: payload });
  });

  it('descarta campos que o navegador não deve mandar (site, horário, IP)', () => {
    const body = JSON.stringify({ ...buildPageview(), site: 'outro', ts: 1, ip: '1.2.3.4' });
    expect(parseEventBody(body)).toEqual({ ok: true, value: buildPageview() });
  });

  it('recusa corpo acima do limite antes de ler o JSON', () => {
    expect(codes('x'.repeat(MAX_BODY_BYTES + 1))).toEqual(['size']);
  });

  it('conta o limite em bytes, não em caracteres', () => {
    expect(codes('é'.repeat(MAX_BODY_BYTES / 2 + 1))).toEqual(['size']);
  });

  it('recusa corpo que não é JSON', () => {
    expect(codes('{nao-json')).toEqual(['json']);
  });

  it.each([
    ['outra versão do formato', { ...buildPageview(), formatVersion: 2 }],
    ['tipo desconhecido', { ...buildPageview(), type: 'click' }],
    ['eventId que não é UUID', buildPageview({ eventId: 'abc' })],
    ['página sem artigo nem caminho', { ...buildPageview(), page: {} }],
    ['caminho sem barra inicial', { ...buildPageview(), page: { pageType: 'home', path: 'x' } }],
    ['referrer longo demais', buildPageview({ referrer: `https://x.com/${'a'.repeat(1100)}` })],
  ])('recusa %s', (_, payload) => {
    expect(codes(JSON.stringify(payload)).every((code) => code.startsWith('schema.'))).toBe(true);
    expect(codes(JSON.stringify(payload)).length).toBeGreaterThan(0);
  });
});

describe('PageviewPayloadSchema', () => {
  it('exige sid em formato UUID quando presente', () => {
    expect(PageviewPayloadSchema.safeParse(buildPageview({ sid: 'abc' })).success).toBe(false);
  });
});
