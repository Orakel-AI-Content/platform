import { RESOURCES, type SiteConfig } from '@orakel/content-model/v1';
import { describe, expect, it } from 'vitest';

import {
  emptyFormValues,
  fieldForPath,
  SiteConfigFormSchema,
  toFormValues,
  toSiteConfig,
} from './site-config-form-values.ts';

const config: SiteConfig = {
  siteId: 'exemplo-c',
  name: 'Exemplo C',
  domains: ['c.example.com', 'www.c.example.com'],
  language: 'pt-BR',
  timeZone: 'America/Sao_Paulo',
  indexavel: false,
  theme: 'padrao',
  presets: { home: 'revista', artigo: 'padrao', categoria: 'padrao', autor: 'padrao' },
  variants: { articleCard: 'horizontal' },
  featureFlags: { busca: true, comentarios: false },
  crawlers: { block: ['GPTBot'] },
  integrations: { ga4: { enabled: true, measurementId: 'G-ABC123' } },
};

describe('valores do formulário de configuração', () => {
  it('ida e volta preserva a configuração (sem textos institucionais)', () => {
    const withTexts: SiteConfig = { ...config, institutionalTexts: { about: [] } };
    expect(toSiteConfig(toFormValues(withTexts))).toEqual(config);
  });

  it('listas: um item por linha, sem linhas vazias nem espaços', () => {
    const values = {
      ...toFormValues(config),
      domains: '  a.example.com \n\n b.example.com\n',
      crawlers: { allow: '', block: '' },
      featureFlags: [{ name: ' ', enabled: true }],
      integrations: { ga4: { enabled: false, measurementId: ' ' } },
    };
    const result = toSiteConfig(values);
    expect(result.domains).toEqual(['a.example.com', 'b.example.com']);
    expect(result.crawlers).toBeUndefined();
    expect(result.featureFlags).toEqual({});
    expect(result.integrations.ga4).toEqual({ enabled: false });
  });

  it('o cadastro começa com a primeira opção de cada preset e variante', () => {
    const values = emptyFormValues(RESOURCES);
    expect(values.presets).toEqual({
      home: 'padrao',
      artigo: 'padrao',
      categoria: 'padrao',
      autor: 'padrao',
    });
    expect(values.variants).toEqual({ articleCard: 'vertical' });
  });

  it('o schema do formulário valida pela SiteConfig e aponta o campo', () => {
    const parsed = SiteConfigFormSchema.safeParse({
      ...toFormValues(config),
      domains: 'Nao-E-Host',
      integrations: { ga4: { enabled: true, measurementId: '' } },
    });
    expect(parsed.success).toBe(false);
    const fields = parsed.error?.issues.map((issue) => fieldForPath(issue.path));
    expect(fields).toEqual(expect.arrayContaining(['domains', 'integrations.ga4.measurementId']));
  });

  it.each([
    [['siteId'], 'siteId'],
    [['domains', 1], 'domains'],
    [['presets', 'home'], 'presets.home'],
    [['variants', 'articleCard'], 'variants.articleCard'],
    [['crawlers', 'block', 0], 'crawlers.block'],
    [['featureFlags', 'Nome Ruim'], 'featureFlags'],
    [['integrations', 'ga4', 'measurementId'], 'integrations.ga4.measurementId'],
    [['indexavel'], 'indexavel'],
    [[], undefined],
    [['institutionalTexts', 'about'], undefined],
  ])('path %j → campo %s', (path, field) => {
    expect(fieldForPath(path)).toBe(field);
  });
});
