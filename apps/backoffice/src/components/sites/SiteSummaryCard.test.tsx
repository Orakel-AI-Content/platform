// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONTROL_SIZES } from '@/components/ui/utils/constants';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import { SiteSummaryCard } from './SiteSummaryCard.tsx';

// Resumo da página do site (#370): os campos no InfoList e "Publicar agora" só com a ação.

afterEach(cleanup);

const site: SiteSummary = {
  id: 'exemplo-a',
  name: 'Exemplo A',
  domain: 'exemplo-a.test',
  lifecycle: 'publicado',
  state: 'ativo',
  pausedReason: null,
  release: '1.4.0',
  indexavel: true,
  pendingChanges: 2,
  lastBuild: { status: 'ok', versionId: 'v7', finishedAt: new Date('2026-10-20T12:00:00.000Z') },
  buildWindowSeconds: null,
  effectiveBuildWindowSeconds: 300,
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
  it('mostra domínio, indexável, estado, release, pendências, último build e G1 no InfoList', () => {
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
});
