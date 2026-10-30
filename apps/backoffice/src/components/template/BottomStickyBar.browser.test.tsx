import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';

import Container from '@/components/shared/Container';
import EllipsisButton from '@/components/shared/EllipsisButton';
import { Button } from '@/components/ui/Button';
import classNames from '@/components/ui/utils/classNames';

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
import BottomStickyBar from './BottomStickyBar.tsx';
import { PAGE_CONTAINER_GUTTER_X, PAGE_CONTAINER_GUTTER_Y } from './constants.ts';

// BottomStickyBar em Chromium (#459; da vitrine, #322): a barra de ações do formulário presa ao
// fim da janela, encostada nas bordas do `main` (margem negativa igual ao gutter) em cada
// breakpoint, com alvo de 24 px e foco de 2px. O `main` é o do layout `(admin)`, com os
// mesmos gutters.

function FormWithBar() {
  return (
    <main
      id="conteudo"
      className={classNames(
        'bg-gray-100 dark:bg-gray-950',
        PAGE_CONTAINER_GUTTER_X,
        PAGE_CONTAINER_GUTTER_Y,
      )}
    >
      <section aria-label="BottomStickyBar" className="space-y-3">
        <div
          data-rolagem-barra=""
          className="h-[120vh] rounded-md border border-gray-200 p-4 text-sm dark:border-gray-700"
        >
          Formulário longo para rolar.
        </div>
        <BottomStickyBar>
          <Container>
            <div className={`flex items-center justify-between gap-3 ${PAGE_CONTAINER_GUTTER_X}`}>
              <EllipsisButton aria-label="Mais ações do formulário" />
              <div className="flex items-center gap-3">
                <Button type="button">Descartar</Button>
                <Button type="button" variant="solid">
                  Publicar
                </Button>
              </div>
            </div>
          </Container>
        </BottomStickyBar>
      </section>
      <div className="h-[50vh]" />
    </main>
  );
}

describe.each(COLOR_SCHEMES)('BottomStickyBar no navegador (%s)', (scheme) => {
  it('alvo de 24 px, foco de 2px e sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(<FormWithBar />);
    const more = screen.getByRole('button', { name: 'Mais ações do formulário' });

    for (const name of ['Mais ações do formulário', 'Descartar', 'Publicar']) {
      const button = screen.getByRole('button', { name, exact: true });
      await tabTo(button);
      const { width, height } = targetSize(button);
      expect(width).toBeGreaterThanOrEqual(24);
      expect(height).toBeGreaterThanOrEqual(24);
      expect(outline(button)).toEqual(focusRing());
    }
    await expect.element(more).toHaveTextContent('');
    expect(more.element().querySelectorAll('[aria-hidden="true"] svg')).toHaveLength(1);
    expect(await audit(screen.container)).toEqual([]);
  });
});

// Larguras dos três gutters do `main` (`px-4 sm:px-6 md:px-8`): abaixo de `sm`, entre `sm` e
// `md` e acima de `md`.
describe('BottomStickyBar no navegador', () => {
  it.each([375, 700, 1280])(
    'presa ao fim da janela e encostada nas bordas do main (%i px)',
    async (width) => {
      await page.viewport(width, 800);
      const screen = await renderUi(<FormWithBar />);
      const publish = screen.getByRole('button', { name: 'Publicar' });
      const bar = publish.element().closest('.sticky')!;

      // No meio do formulário longo, o fim da seção está abaixo da janela: a barra gruda embaixo.
      screen.container.querySelector('[data-rolagem-barra]')!.scrollIntoView({ block: 'center' });
      await expect.element(publish).toBeInViewport();
      await expect
        .poll(() => Math.abs(bar.getBoundingClientRect().bottom - window.innerHeight))
        .toBeLessThanOrEqual(1);

      const barBox = bar.getBoundingClientRect();
      const mainBox = screen.container.querySelector('main#conteudo')!.getBoundingClientRect();
      expect(Math.abs(barBox.x - mainBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(barBox.width - mainBox.width)).toBeLessThanOrEqual(1);
    },
  );
});
