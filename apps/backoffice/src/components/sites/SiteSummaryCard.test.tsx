// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SiteInstance, SiteSummary } from '@/domain/sites/sites.ts';

import { SiteSummaryCard } from './SiteSummaryCard.tsx';

// Resumo da página do site (#370): os campos no InfoList e o estado da instância (#516), só o
// estado atual: o domínio como link, sem builds nem botões (#595).

afterEach(cleanup);

const site: SiteSummary = {
  id: 'exemplo-a',
  name: 'Exemplo A',
  domain: 'exemplo-a.test',
  lifecycle: 'publicado',
  state: 'ativo',
  pausedReason: null,
  pausedCulprit: null,
  activeVersionId: null,
  release: '1.4.0',
  indexavel: true,
  pendingChanges: 2,
  lastBuild: { status: 'ok', versionId: 'v7', finishedAt: new Date('2026-10-20T12:00:00.000Z') },
  buildWindowSeconds: null,
  effectiveBuildWindowSeconds: 300,
  dailyPublishLimit: null,
  effectiveDailyPublishLimit: 10,
  publishedToday: 0,
  timeZone: 'America/Sao_Paulo',
};

const instance: SiteInstance = {
  recentBuilds: [
    {
      id: 9,
      status: 'failed',
      release: '1.5.0',
      versionId: null,
      finishedAt: new Date('2026-10-21T12:00:00.000Z'),
    },
    {
      id: 8,
      status: 'ok',
      release: '1.4.0',
      versionId: 'v7',
      finishedAt: new Date('2026-10-20T12:00:00.000Z'),
    },
  ],
  activeFiles: 120,
  pendingByOrigin: [
    { origin: 'content', count: 2 },
    { origin: 'config', count: 1 },
  ],
};

const empty: SiteInstance = { recentBuilds: [], activeFiles: null, pendingByOrigin: [] };

/** Valor (`dd`) do campo de rótulo `label`. */
function field(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`Campo sem valor: ${label}`);
  return value;
}

describe('SiteSummaryCard', () => {
  it('mostra domínio, indexável, estado, release, pendências, G1 e o uso do limite', () => {
    render(<SiteSummaryCard site={site} instance={instance} g1Registered />);

    const list = document.querySelector('.card dl');
    expect(list?.className).toContain('text-sm');
    const domain = within(field('Domínio')).getByRole('link', {
      name: 'exemplo-a.test (abre em nova aba)',
    });
    expect(domain.getAttribute('href')).toBe('https://exemplo-a.test');
    expect(domain.getAttribute('target')).toBe('_blank');
    expect(domain.getAttribute('rel')).toBe('noopener noreferrer');
    expect(field('Indexável').textContent).toBe('Sim');
    expect(field('Status').textContent).toBe('Ativo');
    expect(field('Release').textContent).toBe('1.4.0');
    expect(
      within(field('Mudanças pendentes')).getByRole('link', { name: /2 mudanças pendentes/ }),
    ).toBeTruthy();
    expect(field('G1').textContent).toBe('Registrado');
    expect(field('Publicações hoje').textContent).toBe('0 de 10');
  });

  it('mostra a versão no ar com os arquivos e as mudanças pendentes por origem', () => {
    render(
      <SiteSummaryCard
        site={{ ...site, activeVersionId: 'v7' }}
        instance={instance}
        g1Registered
      />,
    );

    expect(field('Versão no ar').textContent).toBe('v7120 arquivos');
    const origins = within(field('Mudanças pendentes')).getAllByRole('listitem');
    expect(origins.map((item) => item.textContent)).toEqual(['Conteúdo2', 'Configuração1']);
  });

  it('com um arquivo só, no singular', () => {
    render(
      <SiteSummaryCard
        site={{ ...site, activeVersionId: 'v7' }}
        instance={{ ...instance, activeFiles: 1 }}
        g1Registered
      />,
    );

    expect(field('Versão no ar').textContent).toBe('v71 arquivo');
  });

  it('sem domínio, versão no ar e pendências, cada bloco mostra o estado vazio', () => {
    render(
      <SiteSummaryCard
        site={{ ...site, domain: '', pendingChanges: 0 }}
        instance={empty}
        g1Registered
      />,
    );

    expect(field('Domínio').textContent).toBe('—');
    expect(field('Versão no ar').textContent).toBe('Nenhuma versão no ar');
    expect(field('Mudanças pendentes').textContent).toBe('0');
    expect(within(field('Mudanças pendentes')).queryByRole('list')).toBeNull();
  });

  it('com o limite do dia ocupado, diz que foi atingido', () => {
    render(
      <SiteSummaryCard site={{ ...site, publishedToday: 10 }} instance={instance} g1Registered />,
    );

    expect(field('Publicações hoje').textContent).toBe('10 de 10Limite do dia atingido.');
  });

  it('sem release, sem build e sem G1, diz o que falta', () => {
    render(
      <SiteSummaryCard
        instance={empty}
        site={{ ...site, release: null, lastBuild: null, indexavel: false, pendingChanges: 0 }}
        g1Registered={false}
      />,
    );

    expect(field('Indexável').textContent).toBe('Não');
    expect(field('Release').textContent).toBe('Sem release');
    expect(field('Mudanças pendentes').textContent).toBe('0');
    expect(field('G1').textContent).toBe('Não registrado');
  });

  it('pausado, o estado traz o motivo', () => {
    render(
      <SiteSummaryCard
        instance={instance}
        site={{ ...site, state: 'pausado', pausedReason: 'Build falhou três vezes.' }}
        g1Registered
      />,
    );

    expect(field('Status').textContent).toBe('PausadoBuild falhou três vezes.');
  });

  it('pausado com culpado, o estado leva ao conteúdo culpado (#511)', () => {
    render(
      <SiteSummaryCard
        site={{
          ...site,
          state: 'pausado',
          pausedReason: 'Build falhou três vezes.',
          pausedCulprit: { origin: 'author', reference: '3' },
        }}
        instance={instance}
        g1Registered
      />,
    );

    const link = within(field('Status')).getByRole('link', {
      name: `Autor 3 culpado pela pausa de ${site.id}`,
    });
    expect(link.getAttribute('href')).toBe(`/sites/${site.id}/autores/3`);
  });

  it('só o estado atual: sem os últimos builds e sem botões, ativo ou pausado', () => {
    const { rerender } = render(<SiteSummaryCard site={site} instance={instance} g1Registered />);
    expect(screen.queryByText('Últimos builds')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(
      <SiteSummaryCard
        site={{ ...site, state: 'pausado', pausedReason: 'x' }}
        instance={instance}
        g1Registered
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
