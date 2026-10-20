// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SideNavProvider, useSideNav } from './SideNavContext.tsx';

// Estado da barra lateral (#238): começa expandida; `setCollapsed` alterna para quem está no
// provider; fora dele, vale o padrão do contexto (expandida, sem efeito).

afterEach(cleanup);

/** Consumidor mínimo: mostra o estado e alterna num botão. */
function Consumer() {
  const { collapsed, setCollapsed } = useSideNav();
  return (
    <button type="button" aria-pressed={collapsed} onClick={() => setCollapsed(!collapsed)}>
      Recolher
    </button>
  );
}

const button = () => screen.getByRole('button', { name: 'Recolher' });

describe('SideNavContext', () => {
  it('no provider, começa expandida e alterna', async () => {
    const user = userEvent.setup();
    render(
      <SideNavProvider>
        <Consumer />
      </SideNavProvider>,
    );

    expect(button().getAttribute('aria-pressed')).toBe('false');
    await user.click(button());
    expect(button().getAttribute('aria-pressed')).toBe('true');
    await user.click(button());
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('o estado é compartilhado entre os consumidores do mesmo provider', async () => {
    const user = userEvent.setup();
    render(
      <SideNavProvider>
        <Consumer />
        <Consumer />
      </SideNavProvider>,
    );

    const [first, second] = screen.getAllByRole('button', { name: 'Recolher' });
    await user.click(first!);
    expect(second!.getAttribute('aria-pressed')).toBe('true');
  });

  it('fora do provider, fica expandida e alternar não muda nada', async () => {
    const user = userEvent.setup();
    render(<Consumer />);

    expect(button().getAttribute('aria-pressed')).toBe('false');
    await user.click(button());
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });
});
