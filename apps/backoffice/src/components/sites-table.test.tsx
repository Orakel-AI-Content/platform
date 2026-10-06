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
});
