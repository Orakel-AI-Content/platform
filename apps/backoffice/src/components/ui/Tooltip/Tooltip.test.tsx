// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Tooltip } from './index.tsx';

// Tooltip do Ecme (#211) sobre o floating-ui: abre no hover e no foco, fecha com Esc e liga a
// dica ao filho focável por aria-describedby.

beforeAll(() => {
  // O happy-dom rejeita a animação nativa que o motion cancela ao desmontar.
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

describe('Tooltip', () => {
  it('fechada: sem dica e sem aria-describedby no botão', () => {
    render(
      <Tooltip title="Copiar o link">
        <button type="button">Copiar</button>
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copiar' }).hasAttribute('aria-describedby')).toBe(
      false,
    );
  });

  it('isOpen abre de início; a dica descreve o botão, somando ao aria-describedby dele', async () => {
    render(
      <>
        <span id="dica-extra">Atalho: C</span>
        <Tooltip title="Copiar o link" isOpen>
          <button type="button" aria-describedby="dica-extra">
            Copiar
          </button>
        </Tooltip>
      </>,
    );

    // O FloatingPortal monta o nó do portal num efeito.
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Copiar o link');
    expect(tooltip.className).toContain('tooltip');
    expect(tooltip.className).toContain('bg-gray-800');
    const describedBy = screen
      .getByRole('button', { name: 'Copiar' })
      .getAttribute('aria-describedby');
    expect(describedBy?.split(' ')).toEqual(['dica-extra', tooltip.id]);
    // O <span> que envolve o filho não repete a descrição.
    expect(screen.getByRole('button').parentElement?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('abre no hover e fecha com Esc', async () => {
    render(
      <Tooltip title="Excluir o artigo">
        <button type="button">Excluir</button>
      </Tooltip>,
    );

    const wrapper = screen.getByRole('button', { name: 'Excluir' }).parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(await screen.findByRole('tooltip')).toBeTruthy();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('abre no foco pelo teclado', async () => {
    render(
      <Tooltip title="Mais opções">
        <button type="button">Mais</button>
      </Tooltip>,
    );

    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mais' }));
    const tooltip = await screen.findByRole('tooltip');
    expect(screen.getByRole('button', { name: 'Mais' }).getAttribute('aria-describedby')).toBe(
      tooltip.id,
    );
  });

  it('com texto como filho, a descrição fica no <span>', async () => {
    render(
      <Tooltip title="Rascunho desde ontem" isOpen>
        Rascunho
      </Tooltip>,
    );

    const tooltip = await screen.findByRole('tooltip');
    const wrapper = screen.getByText('Rascunho');
    expect(wrapper.className).toContain('tooltip-wrapper');
    expect(wrapper.getAttribute('aria-describedby')).toBe(tooltip.id);
  });

  it('disabled não abre', async () => {
    render(
      <Tooltip title="Indisponível" disabled>
        <button type="button">Agendar</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole('button').parentElement!);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a seta fica oculta do leitor de tela', async () => {
    render(
      <Tooltip title="Topo" isOpen placement="bottom">
        <button type="button">Seta</button>
      </Tooltip>,
    );

    const arrow = (await screen.findByRole('tooltip')).querySelector('svg')!;
    expect(arrow.closest('[aria-hidden="true"]')).toBeTruthy();
  });
});
