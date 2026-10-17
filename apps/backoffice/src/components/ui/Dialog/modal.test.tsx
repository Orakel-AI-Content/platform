// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CloseButton } from '../CloseButton/index.tsx';
import { Drawer } from '../Drawer/index.tsx';
import { APP_ELEMENT_ID } from '../utils/modalApp.ts';
import { Dialog } from './index.tsx';

// Dialog, Drawer e CloseButton do Ecme (#209) sobre o react-modal: título ligado por
// aria-labelledby, Esc e fundo caindo no onClose, e o contêiner da app com aria-hidden e inert
// enquanto há diálogo aberto.

let app: HTMLElement;

beforeAll(() => {
  // O happy-dom rejeita a animação nativa que o motion cancela ao desmontar.
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});

afterEach(() => {
  cleanup();
  app.remove();
});

const renderInApp = (ui: React.ReactElement) => render(ui, { container: app });

describe('CloseButton', () => {
  it('botão "Fechar" com o ícone oculto e o onClick', async () => {
    const onClick = vi.fn();
    renderInApp(<CloseButton onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Fechar' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('close-button');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('o nome acessível pode ser trocado', () => {
    renderInApp(<CloseButton aria-label="Fechar aviso" />);
    expect(screen.getByRole('button', { name: 'Fechar aviso' })).toBeTruthy();
  });
});

describe('Dialog', () => {
  it('fechado, não renderiza nada', () => {
    renderInApp(<Dialog isOpen={false} title="Editar" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aberto: título por aria-labelledby, aria-modal e o contêiner da app inerte', () => {
    const { rerender } = renderInApp(
      <Dialog isOpen title="Editar autor">
        <p>Conteúdo</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Editar autor' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('.dialog-content')).toBeTruthy();
    expect(app.getAttribute('aria-hidden')).toBe('true');
    expect(app.inert).toBe(true);

    rerender(<Dialog isOpen={false} title="Editar autor" />);
    expect(app.inert).toBe(false);
  });

  it('Esc e o botão Fechar chamam o onClose quando não há onRequestClose', async () => {
    const onClose = vi.fn();
    renderInApp(<Dialog isOpen title="Excluir" onClose={onClose} />);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('com onRequestClose, o Esc chama só ele', async () => {
    const onClose = vi.fn();
    const onRequestClose = vi.fn();
    renderInApp(
      <Dialog isOpen title="Excluir" onClose={onClose} onRequestClose={onRequestClose} />,
    );

    await userEvent.keyboard('{Escape}');
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sem title, usa o aria de quem chama; closable={false} tira o botão', () => {
    renderInApp(<Dialog isOpen closable={false} contentLabel="Pré-visualização" />);

    expect(screen.getByRole('dialog', { name: 'Pré-visualização' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
  });

  it('largura padrão de 520 px no conteúdo do react-modal', () => {
    renderInApp(<Dialog isOpen title="Largura" />);
    expect(screen.getByRole<HTMLElement>('dialog').style.width).toBe('520px');
  });
});

describe('Drawer', () => {
  it('título em <h4> ligado por aria-labelledby, corpo e rodapé', () => {
    renderInApp(
      <Drawer isOpen title="Filtros" footer={<span>Rodapé</span>}>
        <p>Corpo</p>
      </Drawer>,
    );

    const drawer = screen.getByRole('dialog', { name: 'Filtros' });
    expect(drawer.querySelector('h4')?.textContent).toBe('Filtros');
    expect(drawer.querySelector('.drawer-body')?.textContent).toBe('Corpo');
    expect(drawer.querySelector('.drawer-footer')?.textContent).toBe('Rodapé');
    expect(drawer.querySelector('.drawer-content')?.className).toContain('vertical');
    expect(app.inert).toBe(true);
  });

  it('Esc cai no onClose', async () => {
    const onClose = vi.fn();
    renderInApp(<Drawer isOpen title="Filtros" onClose={onClose} />);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('largura em texto não ganha "false" na posição inicial', () => {
    renderInApp(<Drawer isOpen title="Lado" placement="left" width="50%" />);
    const content = screen.getByRole('dialog').querySelector<HTMLElement>('.drawer-content')!;
    expect(content.style.width).toBe('50%');
    expect(content.getAttribute('style')).not.toContain('false');
  });

  it('em cima ou embaixo, a altura vira o tamanho e a classe é horizontal', () => {
    renderInApp(<Drawer isOpen title="Topo" placement="top" height={240} />);
    const content = screen.getByRole('dialog').querySelector<HTMLElement>('.drawer-content')!;
    expect(content.className).toContain('horizontal');
    expect(content.style.height).toBe('240px');
  });
});
