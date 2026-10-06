import { RESOURCES, SiteConfigSchema, type SiteConfig } from '@orakel/content-model/v1';
import { describe, expect, it } from 'vitest';

import { editValues, emptySiteConfig } from './site-config-form-values.ts';

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
  it('a edição parte da configuração corrente, sem os textos institucionais', () => {
    const withTexts: SiteConfig = { ...config, institutionalTexts: { about: [] } };
    expect(editValues(withTexts)).toEqual(config);
  });

  it('o cadastro começa com a primeira opção de cada preset e variante', () => {
    const values = emptySiteConfig(RESOURCES);
    expect(values.presets).toEqual({
      home: 'padrao',
      artigo: 'padrao',
      categoria: 'padrao',
      autor: 'padrao',
    });
    expect(values.variants).toEqual({ articleCard: 'vertical' });
  });

  it('o cadastro preenchido só nos campos de texto já é uma SiteConfig válida', () => {
    const values = {
      ...emptySiteConfig(RESOURCES),
      siteId: 'novo-site',
      name: 'Novo',
      domains: ['novo.example.com'],
      theme: 'padrao',
    };
    expect(SiteConfigSchema.safeParse(values).success).toBe(true);
  });
});
