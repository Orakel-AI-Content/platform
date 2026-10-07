// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SiteSummary } from '@/domain/sites/sites.ts';

import { SitesTable } from './sites-table.tsx';

// Registro de instâncias: cada site leva aos seus conteúdos, para qualquer papel (#44).

afterEach(cleanup);

const site: SiteSummary = {
  id: 'exemplo-a',
  name: 'Exemplo A',
  domain: 'exemplo-a.test',
  lifecycle: 'publicado',
  state: 'ativo',
  pausedReason: null,
  release: null,
  indexavel: false,
  pendingChanges: 0,
  lastBuild: null,
  buildWindowSeconds: null,
  effectiveBuildWindowSeconds: 300,
};

describe('tabela de sites', () => {
  it('tem o link para os conteúdos de cada site, mesmo sem outras ações', () => {
    render(<SitesTable rows={[site]} />);

    const link = screen.getByRole('link', { name: 'Conteúdos exemplo-a' });
    expect(link.getAttribute('href')).toBe('/sites/exemplo-a/conteudos');
  });

  it('tem o link para a biblioteca de mídia de cada site (#52)', () => {
    render(<SitesTable rows={[site]} />);

    const link = screen.getByRole('link', { name: 'Mídia exemplo-a' });
    expect(link.getAttribute('href')).toBe('/sites/exemplo-a/midia');
  });

  it('dá a cada estado de site o badge da sua variante, com o texto do estado (#86)', () => {
    render(
      <SitesTable
        rows={[
          site,
          { ...site, id: 'exemplo-b', state: 'promovendo' },
          { ...site, id: 'exemplo-c', state: 'pausado', pausedReason: 'cota' },
        ]}
      />,
    );

    expect(screen.getByText('Ativo').className).toContain('text-success');
    expect(screen.getByText('Promovendo').className).toContain('text-info');
    const paused = screen.getByText('Pausado: cota');
    expect(paused.className).toContain('text-warning');
    expect(paused.getAttribute('title')).toBe('cota');
  });

  it('dá a cada resultado de build o badge da sua variante (#86)', () => {
    const finishedAt = new Date('2026-10-01T12:00:00Z');
    render(
      <SitesTable
        rows={[
          { ...site, lastBuild: { status: 'ok', versionId: 'v1', finishedAt } },
          {
            ...site,
            id: 'exemplo-b',
            lastBuild: { status: 'failed', versionId: null, finishedAt },
          },
        ]}
      />,
    );

    // A etapa do ciclo de vida também se chama "Publicado", mas é texto solto na célula.
    expect(screen.getByText('Publicado', { selector: 'span' }).className).toContain('text-success');
    expect(screen.getByText('Falhou').className).toContain('bg-destructive');
  });
});
