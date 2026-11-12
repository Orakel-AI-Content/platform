// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { PauseSiteDialog } from './PauseSiteDialog.tsx';

// "Pausar" com motivo (#650): o motivo é obrigatório (vazio ou só espaços mostra o erro no campo
// e não confirma), vai aparado ao `onConfirm` e o campo começa vazio a cada abertura. O diálogo
// não tem gatilho: aqui, um botão de teste o abre. Foco no navegador, em
// `PauseSiteDialog.browser.test.tsx`.

const NAME = 'Pausar exemplo-a?';
let app: HTMLElement;

function Pause({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        Pausar
      </button>
      <PauseSiteDialog
        siteId="exemplo-a"
        isOpen={open}
        onCancel={() => setOpen(false)}
        onConfirm={(reason) => {
          setOpen(false);
          onConfirm(reason);
        }}
        onAfterClose={() => trigger.current?.focus()}
      />
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
  cleanup();
  await waitFor(() => expect(document.querySelector('.dialog-portal')).toBeNull());
  app.remove();
});

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Pausar' }));
  return screen.getByRole('alertdialog', { name: NAME });
};

describe('Pausar com motivo', () => {
  it.each([
    ['vazio', ''],
    ['só com espaços', '   '],
  ])('motivo %s: não confirma e mostra o erro no campo', async (_, typed) => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Pause onConfirm={onConfirm} />, { container: app });

    const dialog = await open(user);
    const field = within(dialog).getByRole('textbox', { name: /Motivo/ });
    if (typed) await user.type(field, typed);
    await user.click(within(dialog).getByRole('button', { name: 'Pausar' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: NAME })).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(within(dialog).getByText('Informe o motivo da pausa')).toBeTruthy();
    expect(document.activeElement).toBe(field);
  });

  it('com motivo, confirma com ele aparado; digitar limpa o erro', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Pause onConfirm={onConfirm} />, { container: app });

    const dialog = await open(user);
    const field = within(dialog).getByRole('textbox', { name: /Motivo/ });
    await user.click(within(dialog).getByRole('button', { name: 'Pausar' }));
    await user.type(field, '  migração de domínio ');
    expect(field.getAttribute('aria-invalid')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Pausar' }));

    expect(onConfirm).toHaveBeenCalledWith('migração de domínio');
  });

  it('reabrir começa com o campo vazio e sem erro', async () => {
    const user = userEvent.setup();
    render(<Pause onConfirm={vi.fn()} />, { container: app });

    let dialog = await open(user);
    await user.type(within(dialog).getByRole('textbox', { name: /Motivo/ }), 'rascunho');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    dialog = await open(user);
    const field = within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: /Motivo/ });
    expect(field.value).toBe('');
    expect(field.getAttribute('aria-invalid')).toBeNull();
  });
});
