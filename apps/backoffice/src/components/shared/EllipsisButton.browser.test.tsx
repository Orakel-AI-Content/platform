import { describe, expect, it } from 'vitest';

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
import EllipsisButton from './EllipsisButton.tsx';

// EllipsisButton em Chromium (#459; da vitrine, #322): o botão de "mais ações" com nome, ícone
// oculto, alvo de 24 px e foco de 2px, nas duas formas.

describe.each(COLOR_SCHEMES)('EllipsisButton no navegador (%s)', (scheme) => {
  it('alvo de 24 px, foco de 2px, ícone oculto e sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(
      <section aria-label="EllipsisButton" className="flex gap-3">
        <EllipsisButton aria-label="Mais ações do site" />
        <EllipsisButton variant="default" shape="round">
          Mais ações
        </EllipsisButton>
      </section>,
    );
    const iconOnly = screen.getByRole('button', { name: 'Mais ações do site' });

    for (const button of [
      iconOnly,
      screen.getByRole('button', { name: 'Mais ações', exact: true }),
    ]) {
      await tabTo(button);
      const { width, height } = targetSize(button);
      expect(width).toBeGreaterThanOrEqual(24);
      expect(height).toBeGreaterThanOrEqual(24);
      expect(outline(button)).toEqual(focusRing());
    }
    await expect.element(iconOnly).toHaveTextContent('');
    expect(iconOnly.element().querySelectorAll('[aria-hidden="true"] svg')).toHaveLength(1);
    expect(await audit(screen.container)).toEqual([]);
  });
});
