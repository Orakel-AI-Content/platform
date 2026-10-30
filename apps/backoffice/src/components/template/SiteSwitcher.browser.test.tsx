import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { FormsShowcase } from '@/app/(admin)/teste-de-componentes/forms-showcase.tsx';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame, renderUi } from '../../../test/browser/render.tsx';

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

// Com 20 sites (#460; antes no E2E, `sites-list.spec.ts`, #221, #241): sem altura máxima, a lista
// passava da borda inferior e os últimos sites ficavam fora de alcance. Na moldura do admin, a
// 1280 × 720 px, o menu rola por dentro (o <ul>), cabe abaixo do botão, e as setas levam o foco
// até o último site, que entra na vista.
describe('SiteSwitcher com 20 sites', () => {
  const sites = [
    { id: 'exemplo-a', name: 'Exemplo A — Guias' },
    ...Array.from({ length: 19 }, (_, index) => ({
      id: `site-${String(index + 2).padStart(2, '0')}`,
      name: `Site ${String(index + 2).padStart(2, '0')}`,
    })),
  ];

  afterEach(() => {
    navigation.set('/');
  });

  it('a lista cabe na janela, rola e alcança o último site pelas setas', async () => {
    navigation.set('/sites/exemplo-a');
    await renderInFrame(<p>Visão geral</p>, { sites });
    const button = page.getByRole('button', { name: 'Exemplo A — Guias, trocar de site' });
    const menu = page.getByRole('menu');

    (button.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(menu).toBeVisible();
    const list = menu.element().querySelector('ul')!;
    const rect = list.getBoundingClientRect();
    expect(list.querySelectorAll('[role="menuitem"]')).toHaveLength(20);
    expect(rect.bottom).toBeLessThanOrEqual(innerHeight);
    expect(rect.height).toBeLessThanOrEqual(
      innerHeight - button.element().getBoundingClientRect().bottom,
    );
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);

    const items = menu.getByRole('menuitem');
    await expect.element(items.first()).toHaveFocus();
    for (let step = 1; step < 20; step += 1) await userEvent.keyboard('{ArrowDown}');
    await expect.element(items.last()).toHaveFocus();
    await expect.element(items.last()).toBeInViewport();
    await expect.element(items.last()).toHaveAttribute('href', '/sites/site-20');
  });
});
