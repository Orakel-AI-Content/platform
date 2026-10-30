import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { FormsShowcase } from '@/app/(admin)/teste-de-componentes/forms-showcase.tsx';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// SiteSwitcher em Chromium (#459; da vitrine, #390): aberto e recolhido pelo teclado — o foco
// abre no primeiro site e anda pelas setas, o site atual é marcado e o Esc devolve o foco ao
// botão; recolhido, as iniciais na tela e o nome na dica do foco. A fixture é a seção da própria
// vitrine.

/** Os menus abertos ficam opacos depois da transição de abertura (200 ms, no <ul>). */
const menusSettled = () =>
  [...document.querySelectorAll('.dropdown-menu')].every(
    (menu) => getComputedStyle(menu).opacity === '1',
  );

describe.each(COLOR_SCHEMES)('SiteSwitcher no navegador (%s)', (scheme) => {
  it('aberto e recolhido pelo teclado: setas, site atual e Esc, sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(<FormsShowcase />);
    const switchers = screen.getByRole('region', { name: 'SiteSwitcher' });
    const menu = page.getByRole('menu');

    for (const current of ['Receitas da Vó', 'Viagem Leve']) {
      const button = switchers.getByRole('button', { name: `${current}, trocar de site` });
      (button.element() as HTMLElement).focus();
      await userEvent.keyboard('{Enter}');
      await expect.element(menu).toBeVisible();
      expect(
        menu
          .getByRole('menuitem')
          .elements()
          .map((item) => item.textContent),
      ).toEqual(['Receitas da Vó', 'Viagem Leve', 'Casa e Jardim']);
      expect(menu.element().querySelector('[aria-current="true"]')?.textContent).toBe(current);
      // Como nos outros menus da moldura, o foco abre no primeiro item e anda pelas setas.
      await expect.element(menu.getByRole('menuitem').first()).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      const viagem = menu.getByRole('menuitem', { name: 'Viagem Leve' });
      await expect.element(viagem).toHaveFocus();
      await expect.element(viagem).toHaveAttribute('href', '/sites/viagem-leve');

      // A transição de abertura mistura a cor do texto com o fundo enquanto a opacidade sobe.
      await expect.poll(menusSettled).toBe(true);
      expect(await audit(switchers, menu)).toEqual([]);

      await userEvent.keyboard('{Escape}');
      await expect.element(menu).not.toBeInTheDocument();
      await expect.element(button).toHaveFocus();
    }

    // Recolhido: as iniciais na tela, o nome na dica do foco.
    const collapsed = switchers.getByRole('button', { name: 'Viagem Leve, trocar de site' });
    expect(collapsed.element().textContent).toMatch(/^VL/);
    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Viagem Leve');
  });
});
