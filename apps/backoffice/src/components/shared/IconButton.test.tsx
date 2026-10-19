// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { PiArrowUp } from 'react-icons/pi';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { IconButton } from './IconButton.tsx';

// Botão de ícone no Button e no Tooltip do Ecme (#270): nome pelo aria-label, ícone fora da
// árvore de acessibilidade, dica no hover e no foco sem virar descrição do botão, e
// aria-disabled continua focável.

beforeAll(() => {
  // O happy-dom rejeita a animação nativa que o motion cancela ao desmontar.
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

describe('IconButton', () => {
  it('o nome acessível é o rótulo; o ícone fica aria-hidden', () => {
    render(<IconButton label="Mover bloco 3 para cima" icon={<PiArrowUp />} />);

    const button = screen.getByRole('button', { name: 'Mover bloco 3 para cima' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('a dica aparece no hover, com o texto do rótulo, e não descreve o botão', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Remover bloco 3" icon={<PiArrowUp />} />);
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.hover(screen.getByRole('button', { name: 'Remover bloco 3' }));

    expect((await screen.findByRole('tooltip')).textContent).toBe('Remover bloco 3');
    expect(screen.getByRole('button').hasAttribute('aria-describedby')).toBe(false);
  });

  it('a dica aparece no foco por teclado e fecha com Esc', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Inserir link" icon={<PiArrowUp />} />);

    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inserir link' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Inserir link');
    expect(screen.getByRole('button').hasAttribute('aria-describedby')).toBe(false);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('mantém o aria-describedby do próprio chamador', async () => {
    const user = userEvent.setup();
    render(
      <>
        <span id="atalho">Atalho: Ctrl+K</span>
        <IconButton label="Inserir link" icon={<PiArrowUp />} aria-describedby="atalho" />
      </>,
    );

    await user.hover(screen.getByRole('button'));
    await screen.findByRole('tooltip');

    expect(screen.getByRole('button').getAttribute('aria-describedby')).toBe('atalho');
  });

  it('com aria-disabled fica indisponível, continua focável e o clique ainda chega', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton
        label="Mover bloco 1 para cima"
        icon={<PiArrowUp />}
        aria-disabled
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button');

    await user.tab();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
  });
});
