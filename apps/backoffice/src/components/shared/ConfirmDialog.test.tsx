// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import ConfirmDialog from './ConfirmDialog.tsx';

// ConfirmDialog do Ecme (#209): alertdialog com título e texto ligados, cores do @theme e textos
// em pt-BR; sem onClose, fechar cai no onCancel.

let app: HTMLElement;

beforeAll(() => {
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

describe('ConfirmDialog', () => {
  it('alertdialog com o título como nome e o texto como descrição', () => {
    render(
      <ConfirmDialog isOpen type="danger" title="Excluir o autor?">
        <p>O autor sai de todos os artigos.</p>
      </ConfirmDialog>,
      { container: app },
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Excluir o autor?' });
    const describedBy = dialog.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)?.textContent).toBe(
      'O autor sai de todos os artigos.',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar' }).className).toContain('bg-primary');
  });

  it.each([
    ['info', 'bg-info-subtle', 'text-info'],
    ['success', 'bg-success-subtle', 'text-success'],
    ['warning', 'bg-warning-subtle', 'text-warning'],
    ['danger', 'bg-error-subtle', 'text-error'],
  ] as const)('ícone de %s com os tokens do @theme e oculto', (type, background, text) => {
    render(<ConfirmDialog isOpen type={type} title="Aviso" />, { container: app });

    const icon = screen.getByRole('alertdialog').querySelector('.avatar')!;
    expect(icon.className).toContain(background);
    expect(icon.className).toContain(text);
    expect(icon.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('Confirmar e Cancelar chamam os callbacks; Esc sem onClose cai no onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Publicar?"
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmText="Publicar"
      />,
      { container: app },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('com onClose, o Esc chama o onClose e não o onCancel', async () => {
    const onClose = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog isOpen title="Sair?" onClose={onClose} onCancel={onCancel} />, {
      container: app,
    });

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
