// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import SiteNotFound from './not-found.tsx';
import { SiteProvider } from './site-context.tsx';

// "Não encontrado" do site (#78, #381): tela de estado com o link de volta ao site do layout,
// citado pelo nome.

afterEach(cleanup);

describe('não encontrado do site', () => {
  it('mostra o título e o link para o site, pelo nome', () => {
    render(
      <SiteProvider site={{ id: 'exemplo-a', name: 'Exemplo A — Guias' }}>
        <SiteNotFound />
      </SiteProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ir para o site Exemplo A — Guias' }).getAttribute('href'),
    ).toBe('/sites/exemplo-a');
  });
});
