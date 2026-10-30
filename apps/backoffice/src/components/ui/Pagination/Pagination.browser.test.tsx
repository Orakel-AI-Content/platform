import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  tabTo,
  targetSize,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Card } from '../Card';
import { Pagination } from './index.tsx';

// Pagination em Chromium (#459; da vitrine, #214): nav "Paginação" com a página atual em
// aria-current, pontas indisponíveis, alvos de 24 px e teclado. O modo link (getPageHref) com a
// página vinda do servidor (`?pagina-link=`) segue no E2E da vitrine; aqui, só o axe dele.

function Paginations({ linkPage = 20 }: { linkPage?: number }) {
  const [pagina, setPagina] = useState(1);
  return (
    <section aria-label="Pagination" className="space-y-3">
      <Card>
        <div className="space-y-4">
          <Pagination total={100} pageSize={10} displayTotal onChange={setPagina} />
          <p role="status" className="text-sm">
            Página escolhida: {pagina}.
          </p>
        </div>
      </Card>
      <Card>
        <Pagination
          total={200}
          pageSize={10}
          currentPage={linkPage}
          getPageHref={(n) => `/teste-de-componentes?pagina-link=${n}`}
        />
      </Card>
    </section>
  );
}

describe('Pagination no navegador', () => {
  it('com botões: aria-current, pontas indisponíveis, teclado e alvos de 24 px', async () => {
    const screen = await renderUi(<Paginations />);
    const nav = screen.getByRole('navigation', { name: 'Paginação' }).first();
    const status = screen.getByRole('status');

    await expect.element(nav.getByText('Total de 100 itens')).toBeVisible();
    await expect
      .element(nav.getByRole('button', { name: 'Página 1', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(nav.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

    for (const control of nav.getByRole('button').elements()) {
      const { width, height } = targetSize(control);
      expect(width).toBeGreaterThanOrEqual(24);
      expect(height).toBeGreaterThanOrEqual(24);
    }

    const next = nav.getByRole('button', { name: 'Próxima página' });
    await tabTo(next);
    await userEvent.keyboard('{Enter}');
    await expect.element(status).toHaveTextContent('Página escolhida: 2.');
    await expect
      .element(nav.getByRole('button', { name: 'Página 2' }))
      .toHaveAttribute('aria-current', 'page');

    const last = nav.getByRole('button', { name: 'Página 10' });
    await tabTo(last);
    await userEvent.keyboard(' ');
    await expect.element(status).toHaveTextContent('Página escolhida: 10.');
    await expect.element(next).toBeDisabled();
  });
});

describe.each(COLOR_SCHEMES)('Pagination no navegador (%s)', (scheme) => {
  it('nos dois modos, com ponta indisponível, sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(<Paginations linkPage={20} />);

    await screen
      .getByRole('navigation', { name: 'Paginação' })
      .first()
      .getByRole('button', { name: 'Página 2' })
      .click();
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Paginação' })
          .last()
          .getByRole('link', { name: 'Próxima página' }),
      )
      .toHaveAttribute('aria-disabled', 'true');
    expect(await audit(screen.container)).toEqual([]);
  });
});
