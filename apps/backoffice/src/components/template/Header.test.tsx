// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import Header from './Header.tsx';

// Header da moldura (Ecme): o landmark `banner` com o início e o fim sempre, e o meio só quando
// há `headerMiddle`.

afterEach(cleanup);

describe('Header', () => {
  it('é o landmark banner, com o início e o fim na ordem', () => {
    render(
      <Header
        headerStart={<button type="button">Início</button>}
        headerEnd={<button type="button">Sair</button>}
      />,
    );

    const banner = screen.getByRole('banner');
    expect(
      within(banner)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Início', 'Sair']);
  });

  it('o meio aparece entre o início e o fim só com headerMiddle', () => {
    render(
      <Header
        headerStart={<button type="button">Início</button>}
        headerMiddle={<button type="button">Meio</button>}
        headerEnd={<button type="button">Sair</button>}
      />,
    );

    expect(
      within(screen.getByRole('banner'))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Início', 'Meio', 'Sair']);
  });

  it('sem headerMiddle, não há a área do meio', () => {
    render(<Header headerStart="Início" headerEnd="Sair" />);

    const banner = screen.getByRole('banner');
    expect(banner.textContent).toBe('InícioSair');
    expect(banner.firstElementChild?.children).toHaveLength(2);
  });
});
