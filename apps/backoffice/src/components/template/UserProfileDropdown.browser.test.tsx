import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';
import UserProfileDropdown from './UserProfileDropdown';

// Menu de perfil do cabeçalho em Chromium (#476; antes no E2E, `header.spec.ts`, #239): abre com
// Espaço pelo teclado, mostra o e-mail e os papéis, fecha com Esc e devolve o foco ao avatar; o
// menu aberto fica sem violação do axe nos dois temas. "Sair" encerrando a sessão do Access
// continua no E2E da pilha.

const EMAIL = 'editor@orakel.local';

const button = () => page.getByRole('button', { name: /^Perfil de / });
const menu = () => page.getByRole('menu');

/** O menu fica opaco depois da transição de abertura (no <ul>). */
const menuSettled = () =>
  getComputedStyle(document.querySelector('.dropdown-menu')!).opacity === '1';

describe.each(COLOR_SCHEMES)('UserProfileDropdown no navegador (%s)', (scheme) => {
  it('abre com Espaço e fecha com Esc, devolvendo o foco ao avatar; aberto, sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderUi(
      <header className="header">
        <UserProfileDropdown email={EMAIL} roles={['editor']} />
      </header>,
    );

    await tabTo(button());
    await userEvent.keyboard(' ');
    await expect.element(menu()).toBeVisible();
    await expect.element(button()).toHaveAttribute('aria-expanded', 'true');
    await expect.element(page.getByText(EMAIL, { exact: true })).toBeVisible();
    // A transição de abertura do menu (opacidade) mistura o texto com o fundo; o axe roda
    // depois dela, como no Dropdown da vitrine (#210).
    await expect.poll(menuSettled).toBe(true);
    expect(await audit(document.querySelector('.header')!, menu())).toEqual([]);

    await userEvent.keyboard('{Escape}');
    await expect.element(menu()).not.toBeInTheDocument();
    await expect.element(button()).toHaveFocus();
  });
});
