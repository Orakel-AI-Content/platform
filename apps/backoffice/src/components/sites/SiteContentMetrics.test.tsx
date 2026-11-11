// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ContentStatusCounts } from '@/domain/content/contents.ts';

import { SiteContentMetrics } from './SiteContentMetrics.tsx';

// Cartões de conteúdo da Visão geral (#596): a contagem de cada status em pt-BR, o link de
// cada cartão para a lista filtrada (a fila, em revisão) e o "Criar conteúdo" só com content.write.

afterEach(cleanup);

const ZERO: ContentStatusCounts = {
  rascunho: 0,
  em_revisao: 0,
  aprovado: 0,
  agendado: 0,
  publicado: 0,
  despublicado: 0,
  substituido: 0,
};

const COUNTS: ContentStatusCounts = {
  ...ZERO,
  rascunho: 12,
  em_revisao: 3,
  aprovado: 1,
  agendado: 2,
  publicado: 1_250,
  despublicado: 4,
};

const renderMetrics = (props: Partial<Parameters<typeof SiteContentMetrics>[0]> = {}) =>
  render(
    <SiteContentMetrics
      siteId="exemplo-a"
      counts={COUNTS}
      publishedToday={2}
      dailyLimit={10}
      canWrite
      {...props}
    />,
  );

const card = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}`) });

describe('SiteContentMetrics', () => {
  it('um cartão-link por status, com a contagem em tabular-nums', () => {
    renderMetrics();
    const expected = [
      ['Rascunho', '12', '/sites/exemplo-a/conteudos?status=rascunho'],
      ['Em revisão', '3', '/sites/exemplo-a/revisao'],
      ['Aprovado', '1', '/sites/exemplo-a/conteudos?status=aprovado'],
      ['Agendado', '2', '/sites/exemplo-a/conteudos?status=agendado'],
      ['Publicado', '1.250', '/sites/exemplo-a/conteudos?status=publicado'],
    ] as const;
    for (const [title, value, href] of expected) {
      const link = card(title);
      expect(link.getAttribute('href')).toBe(href);
      const number = within(link).getByText(value, { exact: true });
      expect(number.className).toContain('tabular-nums');
    }
    // Despublicado e substituído não ganham cartão.
    expect(screen.queryByText('Despublicado')).toBeNull();
  });

  it('as publicações de hoje, com o limite do dia, sem link', () => {
    renderMetrics();
    expect(screen.getByText('Publicações hoje')).toBeTruthy();
    expect(screen.getByText('de 10 por dia')).toBeTruthy();
    expect(screen.getByText('Publicações hoje').closest('a')).toBeNull();
  });

  it('atalhos: "Revisar" sempre, "Criar conteúdo" só com content.write', () => {
    renderMetrics();
    expect(screen.getByRole('link', { name: 'Revisar' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/revisao',
    );
    expect(screen.getByRole('link', { name: 'Criar conteúdo' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/conteudos/novo',
    );
    cleanup();

    renderMetrics({ canWrite: false });
    expect(screen.getByRole('link', { name: 'Revisar' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Criar conteúdo' })).toBeNull();
  });

  it('site sem conteúdo: zeros e o atalho de criar', () => {
    renderMetrics({ counts: ZERO, publishedToday: 0 });
    for (const title of ['Rascunho', 'Em revisão', 'Aprovado', 'Agendado', 'Publicado']) {
      expect(within(card(title)).getByText('0', { exact: true })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: 'Criar conteúdo' })).toBeTruthy();
  });
});
