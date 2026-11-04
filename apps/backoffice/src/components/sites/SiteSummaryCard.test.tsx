// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONTROL_SIZES } from '@/components/ui/utils/constants';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import { SiteSummaryCard } from './SiteSummaryCard.tsx';

// Resumo da página do site (#370): os campos no InfoList e "Publicar agora" ou "Retomar" e
// "Reconstruir na release" (#515) só com a ação.

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

/** Valor (`dd`) do campo de rótulo `label`. */
function field(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`Campo sem valor: ${label}`);
  return value;
}

describe('SiteSummaryCard', () => {
  it('mostra domínio, indexável, estado, release, pendências, último build, G1 e o uso do limite', () => {
    render(<SiteSummaryCard site={site} g1Registered />);

    const list = document.querySelector('.card dl');
    expect(list?.className).toContain('text-sm');
    expect(field('Domínio').textContent).toBe('exemplo-a.test');
    expect(field('Indexável').textContent).toBe('Sim');
    expect(field('Status').textContent).toBe('Ativo');
    expect(field('Release').textContent).toBe('1.4.0');
    expect(
      within(field('Mudanças pendentes')).getByRole('link', { name: /2 mudanças pendentes/ }),
    ).toBeTruthy();
    expect(field('Último build').textContent).toContain('v7');
    expect(field('G1').textContent).toBe('Registrado');
    expect(field('Publicações hoje').textContent).toBe('0 de 10');
  });

  it('com o limite do dia ocupado, diz que foi atingido', () => {
    render(<SiteSummaryCard site={{ ...site, publishedToday: 10 }} g1Registered />);

    expect(field('Publicações hoje').textContent).toBe('10 de 10Limite do dia atingido.');
  });

  it('sem release, sem build e sem G1, diz o que falta', () => {
    render(
      <SiteSummaryCard
        site={{ ...site, release: null, lastBuild: null, indexavel: false, pendingChanges: 0 }}
        g1Registered={false}
      />,
    );

    expect(field('Indexável').textContent).toBe('Não');
    expect(field('Release').textContent).toBe('Sem release');
    expect(field('Mudanças pendentes').textContent).toBe('0');
    expect(field('Último build').textContent).toBe('—');
    expect(field('G1').textContent).toBe('Não registrado');
  });

  it('pausado, o estado traz o motivo', () => {
    render(
      <SiteSummaryCard
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
        g1Registered
      />,
    );

    const link = within(field('Status')).getByRole('link', {
      name: `Autor 3 culpado pela pausa de ${site.id}`,
    });
    expect(link.getAttribute('href')).toBe(`/sites/${site.id}/autores/3`);
  });

  it('"Publicar agora" em sm só quando a página passa a ação', () => {
    const { rerender } = render(<SiteSummaryCard site={site} g1Registered />);
    expect(screen.queryByRole('button', { name: /Publicar agora/ })).toBeNull();

    rerender(
      <SiteSummaryCard
        site={site}
        g1Registered
        publish={vi.fn(() => Promise.resolve({ ok: true, message: 'ok' }))}
      />,
    );
    const publish = screen.getByRole('button', { name: 'Publicar agora exemplo-a' });
    expect(document.querySelector('.card')?.contains(publish)).toBe(true);
    expect(publish.className.split(' ')).toContain(CONTROL_SIZES.sm.h);
  });

  it('pausado, "Retomar" no lugar de "Publicar agora"; ativo, o contrário', () => {
    const action = vi.fn(() => Promise.resolve({ ok: true as const, message: 'ok' }));
    const paused = {
      ...site,
      state: 'pausado' as const,
      pausedReason: 'render: Snapshot inválido',
    };
    const { rerender } = render(
      <SiteSummaryCard site={paused} g1Registered publish={action} resume={action} />,
    );
    const resume = screen.getByRole('button', { name: 'Retomar exemplo-a' });
    expect(document.querySelector('.card')?.contains(resume)).toBe(true);
    expect(screen.queryByRole('button', { name: /Publicar agora/ })).toBeNull();

    rerender(<SiteSummaryCard site={site} g1Registered publish={action} resume={action} />);
    expect(screen.getByRole('button', { name: 'Publicar agora exemplo-a' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Retomar/ })).toBeNull();
  });

  it('"Reconstruir na release" só quando a página passa a ação, ativo ou pausado', () => {
    const rebuild = {
      releases: ['core-v1.3.0'],
      action: vi.fn(() => Promise.resolve({ ok: true as const, message: 'ok' })),
    };
    const { rerender } = render(<SiteSummaryCard site={site} g1Registered />);
    expect(screen.queryByRole('button', { name: 'Reconstruir na release' })).toBeNull();

    rerender(<SiteSummaryCard site={site} g1Registered rebuild={rebuild} />);
    const button = screen.getByRole('button', { name: 'Reconstruir na release' });
    expect(document.querySelector('.card')?.contains(button)).toBe(true);
    expect(button.className.split(' ')).toContain(CONTROL_SIZES.sm.h);

    rerender(
      <SiteSummaryCard
        site={{ ...site, state: 'pausado', pausedReason: 'x' }}
        g1Registered
        rebuild={rebuild}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reconstruir na release' })).toBeTruthy();
  });

  it('"Reverter" só quando a página passa a ação, ativo ou pausado', () => {
    const rollback = {
      versions: [],
      action: vi.fn(() => Promise.resolve({ ok: true as const, message: 'ok' })),
    };
    const { rerender } = render(<SiteSummaryCard site={site} g1Registered />);
    expect(screen.queryByRole('button', { name: 'Reverter' })).toBeNull();

    rerender(<SiteSummaryCard site={site} g1Registered rollback={rollback} />);
    const button = screen.getByRole('button', { name: 'Reverter' });
    expect(document.querySelector('.card')?.contains(button)).toBe(true);

    rerender(
      <SiteSummaryCard
        site={{ ...site, state: 'pausado', pausedReason: 'x' }}
        g1Registered
        rollback={rollback}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reverter' })).toBeTruthy();
  });

  it('sem a ação (editor, revisor), o site pausado não mostra "Retomar"', () => {
    render(
      <SiteSummaryCard site={{ ...site, state: 'pausado', pausedReason: 'x' }} g1Registered />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
