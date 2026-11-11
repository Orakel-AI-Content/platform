// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRef, useState } from 'react';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { RollbackVersion } from '@/domain/builds/builds.ts';

import { RollbackDialog } from './RollbackDialog.tsx';

// Reverter (#514): o Select das versões revertíveis (a página já entrega sem a ativa) começando
// na mais recente a cada abertura e o `onConfirm` com a versão escolhida. O diálogo não tem
// gatilho (#595): aqui, um botão de teste o abre; a action e o retorno ficam no
// `SiteOperations`. Foco e axe no navegador, em `RollbackDialog.browser.test.tsx`.

const VERSIONS: RollbackVersion[] = [
  {
    versionId: '20261010T120000Z-bbbbbbbb',
    release: '1.2.0',
    pages: 12,
    finishedAt: new Date('2026-10-10T12:00:00Z'),
  },
  {
    versionId: '20261001T120000Z-abcdef12',
    release: '1.1.0',
    pages: 10,
    finishedAt: new Date('2026-10-01T12:00:00Z'),
  },
];
const NAME = 'Reverter o site para uma versão anterior?';

let app: HTMLElement;

/** O diálogo aberto por um botão, como o "Mais ações" faz na página do site. */
function Rollback({
  onConfirm,
  versions = VERSIONS,
}: {
  onConfirm: (versionId: string) => void;
  versions?: readonly RollbackVersion[];
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        Reverter
      </button>
      <RollbackDialog
        versions={versions}
        timeZone="America/Sao_Paulo"
        isOpen={open}
        onCancel={() => setOpen(false)}
        onConfirm={(versionId) => {
          setOpen(false);
          onConfirm(versionId);
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

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Reverter' }));
  return screen.getByRole('alertdialog', { name: NAME });
}

describe('reverter', () => {
  it('começa na versão mais recente e confirma com ela', async () => {
    const action = vi.fn();
    render(<Rollback onConfirm={action} />, { container: app });

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('volta para a versão 20261010T120000Z-bbbbbbbb');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reverter' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(action).toHaveBeenCalledWith('20261010T120000Z-bbbbbbbb');
  });

  it('lista só as versões recebidas, com data, release e versão; a escolhida vai ao onConfirm', async () => {
    const action = vi.fn();
    render(<Rollback onConfirm={action} />, { container: app });

    const dialog = await openDialog();
    await userEvent.click(screen.getByRole('combobox', { name: 'Versão' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '10/10/2026, 09:00 BRT · 1.2.0 · 20261010T120000Z-bbbbbbbb',
      '01/10/2026, 09:00 BRT · 1.1.0 · 20261001T120000Z-abcdef12',
    ]);
    await userEvent.click(screen.getByText(/20261001T120000Z-abcdef12/));
    expect(dialog.textContent).toContain('volta para a versão 20261001T120000Z-abcdef12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reverter' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('20261001T120000Z-abcdef12'));
  });

  it('sem versão anterior, o Reverter do diálogo fica desabilitado', async () => {
    const action = vi.fn();
    render(<Rollback onConfirm={action} versions={[]} />, { container: app });

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('Nenhuma versão anterior publicada');
    expect(within(dialog).getByRole('button', { name: 'Reverter' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('cancelar fecha sem confirmar', async () => {
    const action = vi.fn();
    render(<Rollback onConfirm={action} />, { container: app });

    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
  });
});
