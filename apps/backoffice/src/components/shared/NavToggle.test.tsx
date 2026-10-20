// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import NavToggle from './NavToggle.tsx';

// Ícone do menu (#235): oculto do leitor e sem papel próprio, porque quem o usa o põe num
// botão com nome; o ícone troca quando a navegação está recolhida (`toggled`).

afterEach(cleanup);

describe('NavToggle', () => {
  it('o ícone fica oculto e não há botão', () => {
    const { container } = render(<NavToggle className="text-2xl" />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.firstElementChild?.className).toBe('text-2xl');
  });

  it('com toggled, mostra outro ícone, também oculto', () => {
    const { container: aberto } = render(<NavToggle />);
    const { container: recolhido } = render(<NavToggle toggled />);

    const icon = recolhido.querySelector('svg')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.innerHTML).not.toBe(aberto.querySelector('svg')!.innerHTML);
  });
});
