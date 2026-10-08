// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowUp } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IconButton } from './icon-button.tsx';

// Botão de ícone (#131): nome pelo aria-label, dica fora da árvore de acessibilidade e
// visível só no hover e no foco por teclado; aria-disabled continua focável.

afterEach(cleanup);

describe('IconButton', () => {
  it('o nome acessível é o rótulo, lido uma vez (dica e ícone com aria-hidden)', () => {
    render(<IconButton label="Mover bloco 3 para cima" icon={<ArrowUp />} />);

    const button = screen.getByRole('button', { name: 'Mover bloco 3 para cima' });
    expect(button.getAttribute('type')).toBe('button');
    // Ícone e dica, os dois fora da árvore de acessibilidade; a dica repete o rótulo.
    const children = [...button.children];
    expect(children.map((node) => node.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
    expect(children.map((node) => node.textContent)).toEqual(['', 'Mover bloco 3 para cima']);
    expect(button.querySelector('svg')?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('a dica só aparece no hover e no foco por teclado', () => {
    render(<IconButton label="Remover bloco 3" icon={<ArrowUp />} />);

    const tip = screen.getByRole('button').lastElementChild;
    expect(tip?.className).toContain('hidden');
    expect(tip?.className).toContain('group-hover:block');
    expect(tip?.className).toContain('group-focus-visible:block');
    expect(screen.getByRole('button').className).toContain('group');
  });

  it('alvo de 32 px (size-8), acima do mínimo de 24 px', () => {
    render(<IconButton label="Remover bloco 1" icon={<ArrowUp />} />);

    expect(screen.getByRole('button').className).toContain('size-8');
  });

  it('com aria-disabled parece indisponível, continua focável e o clique ainda chega', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton
        label="Mover bloco 1 para cima"
        icon={<ArrowUp />}
        aria-disabled
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button');

    await user.tab();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.className).toContain('aria-disabled:opacity-50');
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
  });
});
