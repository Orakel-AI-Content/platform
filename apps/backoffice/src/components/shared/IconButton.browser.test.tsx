import { PiArrowUp, PiLinkSimple } from 'react-icons/pi';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  setReducedMotion,
  setTheme,
  tabTo,
  targetSize,
} from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';
import { IconButton } from './IconButton.tsx';

// IconButton em Chromium (#457; da vitrine, #270): Button só de ícone com a dica do Tooltip,
// que não vira descrição do botão; alvo de 24 px e foco de 2px nos dois temas.

describe.each(COLOR_SCHEMES)('IconButton no navegador (%s)', (scheme) => {
  it('alvo de 24 px, foco de 2px e dica no hover e no foco', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(
      <section aria-label="IconButton">
        <IconButton label="Inserir link" icon={<PiLinkSimple />} />
        <IconButton label="Mover bloco 1 para cima" icon={<PiArrowUp />} aria-disabled />
      </section>,
    );

    for (const name of ['Inserir link', 'Mover bloco 1 para cima']) {
      const button = screen.getByRole('button', { name, exact: true });
      const size = targetSize(button);
      expect(size.width).toBeGreaterThanOrEqual(24);
      expect(size.height).toBeGreaterThanOrEqual(24);

      await tabTo(button);
      await expect.poll(() => outline(button)).toEqual(focusRing());
      await expect.element(page.getByRole('tooltip')).toHaveTextContent(name);
      await expect.element(button).not.toHaveAttribute('aria-describedby');
      await userEvent.keyboard('{Escape}');
      await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();
    }
    await expect
      .element(screen.getByRole('button', { name: 'Mover bloco 1 para cima' }))
      .toHaveAttribute('aria-disabled', 'true');

    await userEvent.hover(screen.getByRole('button', { name: 'Inserir link' }));
    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Inserir link');
    expect(await audit()).toEqual([]);
  });
});
