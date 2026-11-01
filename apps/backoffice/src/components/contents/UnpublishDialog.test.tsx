// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import type { ActionResult } from '@/components/shared/actionResult.ts';

import { ContentActionScope } from './ContentActionScope.tsx';
import { UnpublishDialog, type UnpublishTarget } from './UnpublishDialog.tsx';

// Despublicar do cabeçalho (#494): o aviso de 404 sem destino, o 301 com destino, o seletor só
// com os outros conteúdos no ar e o retorno padrão (sucesso no toast, recusa no Alert do
// escopo). Foco e axe no navegador, em `UnpublishDialog.browser.test.tsx`.

const TARGETS: UnpublishTarget[] = [
  { id: 1, title: 'Guia completo', slug: 'guia-completo' },
  { id: 2, title: 'Rotina da manhã', slug: 'rotina-da-manha' },
  { id: 3, title: 'Lista de compras', slug: 'lista-de-compras' },
];

let app: HTMLElement;

function Unpublish({ action }: { action: (to?: number) => Promise<ActionResult> }) {
  return (
    <>
      <ContentActionScope>
        <UnpublishDialog contentId={1} slug="guia-completo" targets={TARGETS} action={action} />
      </ContentActionScope>
      <ToastProvider />
    </>
  );
}

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
afterEach(async () => {
  act(() => toast.removeAll());
  cleanup();
  await waitFor(() => expect(document.querySelector('.dialog-portal')).toBeNull());
  app.remove();
});

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Despublicar' }));
  return screen.getByRole('alertdialog', { name: 'Despublicar este conteúdo?' });
}

describe('despublicar', () => {
  it('sem destino, avisa do 404 e chama a action sem `to`; o sucesso vai ao toast', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Conteúdo despublicado.' });
    render(<Unpublish action={action} />, { container: app });

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('/guia-completo/ passa a responder 404');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Despublicar' }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action).toHaveBeenCalledWith(undefined);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Conteúdo despublicado.'),
    );
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('com destino, avisa do 301 e chama a action com o id do destino', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'ok' });
    render(<Unpublish action={action} />, { container: app });

    const dialog = await openDialog();
    await userEvent.click(screen.getByRole('combobox', { name: 'Redirecionar para (opcional)' }));
    await userEvent.click(screen.getByText('Rotina da manhã (/rotina-da-manha/)'));
    expect(dialog.textContent).toContain(
      '/guia-completo/ passa a redirecionar (301) para /rotina-da-manha/',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Despublicar' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith(2));
  });

  it('o seletor lista só os outros conteúdos no ar, sem o próprio', async () => {
    render(<Unpublish action={vi.fn()} />, { container: app });

    await openDialog();
    await userEvent.click(screen.getByRole('combobox', { name: 'Redirecionar para (opcional)' }));

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Rotina da manhã (/rotina-da-manha/)',
      'Lista de compras (/lista-de-compras/)',
    ]);
  });

  it('cancelar fecha sem chamar a action', async () => {
    const action = vi.fn();
    render(<Unpublish action={action} />, { container: app });

    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
  });

  it('a recusa do domínio vai ao Alert do escopo, sem toast de sucesso', async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: 'O conteúdo 1 não está no ar',
    });
    render(<Unpublish action={action} />, { container: app });

    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Despublicar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('O conteúdo 1 não está no ar'),
    );
    expect(screen.getByRole('alert').querySelector('.alert')).toBeTruthy();
    expect(screen.queryByRole('status')?.textContent ?? '').toBe('');
  });
});
