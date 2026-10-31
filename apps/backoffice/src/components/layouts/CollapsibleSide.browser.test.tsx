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
import { followLinks, navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Moldura do admin em Chromium (#460; antes no E2E, `site-layout.spec.ts`, #238, #242): o toggle
// do header recolhe a barra (290 ↔ 80 px), com os itens só no ícone, o nome no link, a dica no
// hover e no foco e o seletor nas iniciais; abaixo de `lg`, a barra e o toggle somem e o botão
// do celular abre o Drawer "Navegação", que prende o foco e fecha com Esc. A 1280 px, a barra
// fica e o botão do celular não. Com os links pelo roteador em memória (#476; antes no E2E,
// `site-layout.spec.ts` e `header.spec.ts`, #171, #172, #238, #242): a área atual pelo endereço,
// a barra, a marca e o seletor só com o teclado, a troca de site na mesma área, a barra recolhida
// entre áreas e o Drawer que fecha ao navegar.

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

/** O primeiro item do seletor recebe o foco quando o menu abre. */
const menuItem = (name: string) => page.getByRole('menu').getByRole('menuitem', { name });

let unfollow: () => void;

beforeEach(() => {
  navigation.set('/sites/exemplo-a/autores');
  unfollow = followLinks();
});

afterEach(() => {
  unfollow();
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

  it('a área atual tem aria-current pelo endereço; fora de um site, "Sites" em Principal e sem as áreas', async () => {
    await renderInFrame(<p>Conteúdo</p>);
    const current = () => areas().element().querySelector('[aria-current="page"]')?.textContent;
    for (const [path, area] of [
      ['/sites/exemplo-a', 'Visão geral'],
      ['/sites/exemplo-a/autores/novo', 'Autores'],
      ['/sites/exemplo-a/conteudos/novo', 'Conteúdos'],
      ['/sites/exemplo-a/conteudos/1/editar', 'Conteúdos'],
      ['/sites/exemplo-a/revisao', 'Revisão'],
      ['/sites/exemplo-a/configuracao', 'Visão geral'],
    ] as const) {
      navigation.set(path);
      await expect.poll(current).toBe(area);
      expect(areas().element().querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    }

    const sites = page.getByRole('navigation', { name: 'Principal' }).getByRole('link', {
      name: 'Sites',
    });
    for (const path of ['/sites', '/sites/novo', '/sites/inexistente']) {
      navigation.set(path);
      await expect.element(areas()).not.toBeInTheDocument();
      await expect
        .element(page.getByRole('button', { name: /trocar de site/ }))
        .not.toBeInTheDocument();
      if (path !== '/sites/inexistente') {
        await expect.element(sites).toHaveAttribute('aria-current', 'page');
      }
    }
    navigation.set('/sites/exemplo-a');
    await expect.element(areas()).toBeVisible();
    await expect.element(sites).not.toHaveAttribute('aria-current');
  });

  it('a marca e as áreas só com o teclado: Enter navega e a área vira a atual', async () => {
    await renderInFrame(<p>Conteúdo</p>, { roles: ['operacao'] });
    const taxonomies = areas().getByRole('link', { name: 'Taxonomias' });
    await tabTo(taxonomies);
    await userEvent.keyboard('{Enter}');
    expect(navigation.get()).toBe('/sites/exemplo-a/taxonomias');
    await expect.element(taxonomies).toHaveAttribute('aria-current', 'page');

    (document.activeElement as HTMLElement | null)?.blur();
    await tabTo(page.getByRole('link', { name: 'Orakel Backoffice' }));
    await userEvent.keyboard('{Enter}');
    expect(navigation.get()).toBe('/sites');
  });

  it('o seletor troca de site na mesma área; de um item, vai à lista', async () => {
    navigation.set('/sites/exemplo-a/midia');
    await renderInFrame(<p>Conteúdo</p>);
    await switcher().click();
    await menuItem(OTHER_SITE).click();
    expect(navigation.get()).toBe('/sites/exemplo-b/midia');

    navigation.set('/sites/exemplo-a/autores/novo');
    await switcher().click();
    await menuItem(OTHER_SITE).click();
    expect(navigation.get()).toBe('/sites/exemplo-b/autores');
  });

  it('o seletor abre, escolhe e fecha só com teclado; Esc devolve o foco ao botão', async () => {
    navigation.set('/sites/exemplo-a/taxonomias');
    await renderInFrame(<p>Conteúdo</p>, { roles: ['operacao'] });
    await tabTo(switcher());
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByRole('menu')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
    await expect.element(switcher()).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await expect.element(menuItem(SITE_NAME)).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(menuItem(OTHER_SITE)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(navigation.get()).toBe('/sites/exemplo-b/taxonomias');
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
  });

  it.each(COLOR_SCHEMES)('o seletor aberto na barra sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<p>Conteúdo</p>);
    (switcher().element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(menuItem(SITE_NAME)).toHaveFocus();
    expect(await audit(sideNav(), page.getByRole('menu'))).toEqual([]);
  });

  it('recolhida, a barra continua assim entre áreas e volta expandida ao montar de novo', async () => {
    const screen = await renderInFrame(<p>Conteúdo</p>, { roles: ['operacao'] });
    await collapse();
    await areas().getByRole('link', { name: 'Mídia' }).click();
    expect(navigation.get()).toBe('/sites/exemplo-a/midia');
    await expect.element(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(sideNavWidth()).toBe(80);

    // Recarregar a página monta a moldura de novo, expandida.
    await screen.unmount();
    await renderInFrame(<p>Conteúdo</p>, { roles: ['operacao'] });
    await expect.element(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(sideNavWidth()).toBe(290);
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

    it('clicar numa área navega e fecha o Drawer', async () => {
      navigation.set('/sites/exemplo-a');
      await renderInFrame(<p>Conteúdo</p>, { roles: ['operacao'] });
      await mobileToggle().click();
      await drawer()
        .getByRole('navigation', { name: 'Áreas do site' })
        .getByRole('link', { name: 'Mídia' })
        .click();
      expect(navigation.get()).toBe('/sites/exemplo-a/midia');
      await expect.element(drawer()).not.toBeInTheDocument();
    });

    it('trocar de site pelo seletor no Drawer leva à mesma área e fecha o Drawer', async () => {
      await renderInFrame(<p>Conteúdo</p>);
      await mobileToggle().click();
      await drawer()
        .getByRole('button', { name: `${SITE_NAME}, trocar de site` })
        .click();
      await menuItem(OTHER_SITE).click();
      expect(navigation.get()).toBe('/sites/exemplo-b/autores');
      await expect.element(drawer()).not.toBeInTheDocument();
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
