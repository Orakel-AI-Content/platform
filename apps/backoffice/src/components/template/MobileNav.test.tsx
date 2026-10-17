// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp.ts';
import navigationConfig, { filterNavigation } from '@/configs/navigation.config';

import MobileNav from './MobileNav.tsx';

// Navegação do celular (#242): o botão do header com `aria-expanded` abre o Drawer "Navegação"
// com o mesmo conteúdo da barra expandida (Principal, seletor de site e áreas, com a atual em
// aria-current); clicar numa área, Esc ou mudar de rota (o seletor de site) fecham.

const pathname = vi.hoisted(() => ({ value: '/sites/exemplo-a/autores' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

const SITES = [
  { id: 'exemplo-a', name: 'Exemplo A' },
  { id: 'exemplo-b', name: 'Exemplo B' },
];

let app: HTMLElement;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  pathname.value = '/sites/exemplo-a/autores';
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});

afterEach(() => {
  cleanup();
  app.remove();
});

const ui = () => (
  <MobileNav
    navigationTree={filterNavigation(navigationConfig, { email: 'e', roles: ['editor'] })}
    sites={SITES}
  />
);

// Com o Drawer aberto, o contêiner da app (onde está o botão) fica com aria-hidden e inert.
const toggle = () => screen.getByRole('button', { name: 'Menu de navegação', hidden: true });

// O Drawer sai depois da transição de fechamento (`closeTimeoutMS`).
const closed = () =>
  waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });

async function open() {
  const view = render(ui(), { container: app });
  await userEvent.click(toggle());
  return { view, drawer: await screen.findByRole('dialog', { name: 'Navegação' }) };
}

describe('MobileNav', () => {
  it('fechado: só o botão, com aria-expanded=false e sem o Drawer', () => {
    render(ui(), { container: app });

    expect(toggle().getAttribute('type')).toBe('button');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aberto: o Drawer tem Principal, o seletor e as áreas, com a atual em aria-current', async () => {
    const { drawer } = await open();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(app.getAttribute('aria-hidden')).toBe('true');
    expect(within(drawer).getByRole('navigation', { name: 'Principal' })).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: 'Exemplo A, trocar de site' })).toBeTruthy();
    const areas = within(drawer).getByRole('navigation', { name: 'Áreas do site' });
    const current = within(areas)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['Autores']);
  });

  it('clicar numa área fecha o Drawer', async () => {
    const { drawer } = await open();
    const areas = within(drawer).getByRole('navigation', { name: 'Áreas do site' });

    await userEvent.click(within(areas).getByRole('link', { name: 'Mídia' }));

    await closed();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('Esc fecha o Drawer', async () => {
    await open();

    await userEvent.keyboard('{Escape}');

    await closed();
  });

  it('mudar de rota com o Drawer aberto (o seletor de site) fecha o Drawer', async () => {
    const { view } = await open();

    pathname.value = '/sites/exemplo-b/autores';
    act(() => view.rerender(ui()));

    await closed();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});
