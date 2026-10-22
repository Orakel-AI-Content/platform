import { describe, expect, it } from 'vitest';

import { renderUi } from '../../../test/browser/render.tsx';
import { Button } from '../ui/Button';
import StickyFooter from './StickyFooter.tsx';

// StickyFooter em Chromium (#457; da vitrine, #206): o rodapé fica visível enquanto a área
// longa rola e não rola a página sozinho.

describe('StickyFooter no navegador', () => {
  it('fica visível ao rolar a área longa', async () => {
    const screen = await renderUi(
      <section aria-label="Rodapé fixo">
        <div data-rolagem="" className="h-[150vh] p-4">
          Área longa para rolar.
        </div>
        <StickyFooter stickyClass="bottom-0 border-t bg-neutral px-4 py-3" defaultClass="px-4 py-3">
          <div className="flex justify-end gap-3">
            <Button>Cancelar</Button>
            <Button variant="solid">Salvar</Button>
          </div>
        </StickyFooter>
      </section>,
    );
    const save = screen.getByRole('button', { name: 'Salvar' });

    // No meio da área longa, o fim da seção está abaixo da janela: o rodapé gruda embaixo.
    screen.container.querySelector('[data-rolagem]')!.scrollIntoView({ block: 'center' });
    await expect.element(save).toBeInViewport();
    expect(save.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight);
    // A página continua onde a pessoa deixou: o rodapé não a rola sozinho até o fim.
    const scrolled = scrollY;
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(scrollY).toBe(scrolled);
  });
});
