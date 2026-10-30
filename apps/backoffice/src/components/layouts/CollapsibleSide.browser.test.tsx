import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../test/browser/a11y.ts';
import { pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Moldura do admin em Chromium (#460; antes no E2E, `site-layout.spec.ts`, #238, #242): o toggle
// do header recolhe a barra (290 ↔ 80 px), com os itens só no ícone, o nome no link, a dica no
// hover e no foco e o seletor nas iniciais; abaixo de `lg`, a barra e o toggle somem e o botão
// do celular abre o Drawer "Navegação", que prende o foco e fecha com Esc. A 1280 px, a barra
// fica e o botão do celular não. O que depende do roteador do Next (a barra recolhida entre
// rotas, navegar pelo Drawer) continua no E2E.

const SITE_NAME = 'Exemplo A — Guias';
const OTHER_SITE = 'Exemplo B — Receitas';
const AREAS = ['Visão geral', 'Conteúdos', 'Revisão', 'Mídia', 'Autores', 'Taxonomias', 'Menus'];

const toggle = () => page.getByRole('button', { name: 'Navegação lateral' });
const mobileToggle = () => page.getByRole('button', { name: 'Menu de navegação' });
const sideNav = () => document.getElementById('barra-lateral')!;
const sideNavWidth = () => sideNav().getBoundingClientRect().width;
const areas = () => page.getByRole('navigation', { name: 'Áreas do site' });
const switcher = () => page.getByRole('button', { name: `${SITE_NAME}, trocar de site` });
const drawer = () => page.getByRole('dialog', { name: 'Navegação' });
/** O elemento do react-modal não tem caixa própria no Drawer: vale a do título. */
const drawerTitle = () => drawer().getByRole('heading', { name: 'Navegação' });

const visible = (element: Element) => getComputedStyle(element).display !== 'none';
/** Botão pelo nome, também oculto (o `getByRole` não acha um elemento com `display: none`). */
const button = (name: string) => document.querySelector(`button[aria-label="${name}"]`)!;

/** Recolhe a barra pelo toggle e espera a largura de 80 px. */
async function collapse() {
  await toggle().click();
  await expect.poll(sideNavWidth).toBe(80);
}

beforeEach(() => {
  navigation.set('/sites/exemplo-a/autores');
});

afterEach(() => {
  navigation.set('/');
});

describe('CollapsibleSide no navegador', () => {
  it('a 1280 px, a barra fixa aparece e o botão do celular não', async () => {
    await renderInFrame(<p>Conteúdo</p>);
    expect(visible(sideNav())).toBe(true);
    await expect.element(toggle()).toBeVisible();
    expect(visible(button('Menu de navegação'))).toBe(false);
  });

  it('o toggle recolhe e expande a barra; recolhida, ícones com nome, dica e aria-current', async () => {
    await renderInFrame(<p>Conteúdo</p>);
    await expect.element(toggle()).toHaveAttribute('aria-expanded', 'true');
    await expect.element(toggle()).toHaveAttribute('aria-controls', 'barra-lateral');
    expect(sideNavWidth()).toBe(290);

    (toggle().element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(toggle()).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(sideNavWidth).toBe(80);

    expect(
      areas()
        .getByRole('link')
        .elements()
        .map((link) => link.textContent),
    ).toEqual([...AREAS, 'Textos institucionais']);
    await expect
      .element(areas().getByRole('link', { name: 'Autores' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.getByRole('link', { name: 'Orakel Backoffice' }))
      .toHaveAttribute('href', '/sites');
    // O seletor vira as iniciais, com o mesmo nome e a dica com o nome do site.
    expect(switcher().element().querySelector('[aria-hidden="true"]')?.textContent).toBe('EA');
    await userEvent.hover(switcher());
    await expect.element(page.getByRole('tooltip', { name: SITE_NAME })).toBeVisible();
    await switcher().click();
    await expect
      .element(page.getByRole('menu').getByRole('menuitem', { name: OTHER_SITE }))
      .toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();

    await userEvent.hover(areas().getByRole('link', { name: 'Mídia' }));
    await expect.element(page.getByRole('tooltip', { name: 'Mídia' })).toBeVisible();
    await commands.resetPointer();
    await expect.poll(() => document.querySelectorAll('[role="tooltip"]').length).toBe(0);

    // A barra vem antes do header no DOM: o Tab parte da marca, o primeiro link dela.
    (page.getByRole('link', { name: 'Orakel Backoffice' }).element() as HTMLElement).focus();
    await tabTo(areas().getByRole('link', { name: 'Taxonomias' }));
    await expect.element(page.getByRole('tooltip', { name: 'Taxonomias' })).toBeVisible();
    await expect.poll(() => document.querySelectorAll('[role="tooltip"]').length).toBe(1);

    (toggle().element() as HTMLElement).focus();
    await userEvent.keyboard(' ');
    await expect.element(toggle()).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(sideNavWidth).toBe(290);
  });

  it.each(COLOR_SCHEMES)('a barra recolhida sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<p>Conteúdo</p>);
    await collapse();
    expect(await audit(sideNav(), document.querySelector('.header')!)).toEqual([]);
  });

  describe('a 375 px', () => {
    beforeEach(async () => {
      await page.viewport(375, 812);
    });

    it('sem a barra fixa; o botão abre o Drawer com o seletor e as áreas, sem rolagem horizontal', async () => {
      await renderInFrame(<p>Conteúdo</p>, { roles: ['operacao'] });
      expect(visible(sideNav())).toBe(false);
      expect(visible(button('Navegação lateral'))).toBe(false);
      expect(pageOverflow()).toBe(0);

      await expect.element(mobileToggle()).toHaveAttribute('aria-expanded', 'false');
      await mobileToggle().click();
      await expect.element(drawerTitle()).toBeVisible();
      await expect
        .element(drawer().getByRole('button', { name: `${SITE_NAME}, trocar de site` }))
        .toBeVisible();
      const drawerAreas = drawer().getByRole('navigation', { name: 'Áreas do site' });
      expect(
        drawerAreas
          .getByRole('link')
          .elements()
          .map((link) => link.textContent),
      ).toEqual(AREAS);
      expect(drawerAreas.element().querySelector('[aria-current="page"]')?.textContent).toBe(
        'Autores',
      );
    });

    it('o foco fica preso no Drawer; Esc fecha e devolve o foco ao botão', async () => {
      await renderInFrame(<p>Conteúdo</p>, { roles: ['operacao'] });
      (mobileToggle().element() as HTMLElement).focus();
      await userEvent.keyboard('{Enter}');
      await expect.element(drawerTitle()).toBeVisible();
      // Aberto, o resto da página (o botão também) fica com aria-hidden e inert.
      expect(button('Menu de navegação').getAttribute('aria-expanded')).toBe('true');
      // Uma volta inteira de Tab: o foco nunca sai do Drawer.
      const stops = drawer().element().querySelectorAll('a, button').length;
      for (let step = 0; step <= stops; step += 1) {
        await userEvent.keyboard('{Tab}');
        expect(drawer().element().contains(document.activeElement)).toBe(true);
      }

      await userEvent.keyboard('{Escape}');
      await expect.element(drawer()).not.toBeInTheDocument();
      await expect.element(mobileToggle()).toHaveFocus();
      await expect.element(mobileToggle()).toHaveAttribute('aria-expanded', 'false');
    });

    it.each(COLOR_SCHEMES)('o Drawer aberto sem violação do axe (%s)', async (scheme) => {
      await setTheme(scheme);
      await setReducedMotion('reduce');
      await renderInFrame(<p>Conteúdo</p>);
      await mobileToggle().click();
      await expect.element(drawerTitle()).toBeVisible();
      expect(await audit()).toEqual([]);
    });
  });
});
