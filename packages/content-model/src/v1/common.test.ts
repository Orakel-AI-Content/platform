import { describe, expect, it } from 'vitest';

import {
  HostnameSchema,
  HrefSchema,
  IsoDateTimeSchema,
  LanguageSchema,
  PathSchema,
  SlugSchema,
  TimeZoneSchema,
} from './common.ts';

const accepts = (schema: { safeParse(v: unknown): { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('primitivos da v1', () => {
  it.each(['artigo', 'meu-artigo-2', 'a1'])('slug aceita %s', (value) => {
    expect(accepts(SlugSchema, value)).toBe(true);
  });
  it.each(['Artigo', 'meu_artigo', '-a', 'a-', 'a--b', ''])('slug recusa %s', (value) => {
    expect(accepts(SlugSchema, value)).toBe(false);
  });

  it.each(['exemplo.com.br', 'www.exemplo.com'])('host aceita %s', (value) => {
    expect(accepts(HostnameSchema, value)).toBe(true);
  });
  it.each(['https://exemplo.com', 'exemplo', 'Exemplo.com', 'exemplo.com:8080'])(
    'host recusa %s',
    (value) => {
      expect(accepts(HostnameSchema, value)).toBe(false);
    },
  );

  it.each(['/', '/sobre/', 'https://exemplo.org/x', 'http://exemplo.org'])(
    'href aceita %s',
    (value) => {
      expect(accepts(HrefSchema, value)).toBe(true);
    },
  );
  it.each(['//exemplo.org', 'javascript:alert(1)', 'sobre', 'ftp://exemplo.org', 'https://'])(
    'href recusa %s',
    (value) => {
      expect(accepts(HrefSchema, value)).toBe(false);
    },
  );

  it.each(['/', '/a/b/'])('caminho aceita %s', (value) => {
    expect(accepts(PathSchema, value)).toBe(true);
  });
  it.each(['a/', '//a', '/com espaço'])('caminho recusa %s', (value) => {
    expect(accepts(PathSchema, value)).toBe(false);
  });

  it.each(['pt-BR', 'en', 'spa'])('idioma aceita %s', (value) => {
    expect(accepts(LanguageSchema, value)).toBe(true);
  });
  it.each(['pt_BR', 'PT-br', 'portugues'])('idioma recusa %s', (value) => {
    expect(accepts(LanguageSchema, value)).toBe(false);
  });

  it('fuso aceita um nome IANA e recusa um inventado', () => {
    expect(accepts(TimeZoneSchema, 'America/Sao_Paulo')).toBe(true);
    expect(accepts(TimeZoneSchema, 'America/Atlantida')).toBe(false);
  });

  it('data exige ISO 8601 com fuso', () => {
    expect(accepts(IsoDateTimeSchema, '2026-09-29T12:00:00-03:00')).toBe(true);
    expect(accepts(IsoDateTimeSchema, '2026-09-29T12:00:00Z')).toBe(true);
    expect(accepts(IsoDateTimeSchema, '29/09/2026')).toBe(false);
  });
});
