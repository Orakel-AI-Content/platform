// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast, ToastProvider } from '@/components/ui/toast';
import { CONTROL_SIZES } from '@/components/ui/utils/constants';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { SiteOperations, SiteOperationsScope } from './SiteOperations.tsx';

// Ações de operação no cabeçalho da página do site (#595): "Publicar agora" ou, pausado,
// "Retomar" como botão principal, "Reconstruir na release" e "Reverter" no "Mais ações", cada
// uma com a confirmação de hoje (#327, #514, #515); o sucesso vai ao toast e a recusa ao Alert
// do `SiteOperationsScope`, depois do cabeçalho. Foco e axe no navegador, em
// `SiteOperations.browser.test.tsx`.

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
let app: HTMLElement;
beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});
afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
  app.remove();
});

const ok = (message: string) =>
  vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: true, message }));
const refused = (message: string) =>
  vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: false, message }));

const RELEASES = [{ tag: '1.3.0', imageStatus: 'disponivel' as const }];
const VERSIONS = [
  {
    versionId: '20261010T120000Z-bbbbbbbb',
    release: '1.2.0',
    pages: 12,
    finishedAt: new Date('2026-10-10T12:00:00Z'),
  },
];

type Props = Partial<ComponentProps<typeof SiteOperations>>;

function Operations(props: Props) {
  return (
    <>
      <SiteOperationsScope>
        <div data-testid="header">
          <SiteOperations
            siteId="exemplo-a"
            paused={false}
            release="1.2.0"
            timeZone="America/Sao_Paulo"
            {...props}
          />
        </div>
      </SiteOperationsScope>
      <ToastProvider />
    </>
  );
}

function renderOperations(props: Props) {
  return render(<Operations {...props} />, { container: app });
}

/** O Alert do cabeçalho: o `role="alert"` logo depois dele. */
const headerAlert = () => {
  const alert = screen.getByTestId('header').nextElementSibling;
  if (!(alert instanceof HTMLElement)) throw new Error('sem o Alert do cabeçalho');
  return alert;
};

async function chooseFromMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Mais ações: exemplo-a' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

describe('botão principal', () => {
  it('"Publicar agora" em sm na cor de erro; confirma e o sucesso vai ao toast', async () => {
    const user = userEvent.setup();
    const publish = ok('Build de exemplo-a enfileirado.');
    renderOperations({ publish, resume: ok('') });
    expect(screen.queryByRole('button', { name: /Retomar/ })).toBeNull();
    const button = screen.getByRole('button', { name: 'Publicar agora exemplo-a' });
    expect(button.className).toContain('text-error');
    expect(button.className.split(' ')).toContain(CONTROL_SIZES.sm.h);

    await user.click(button);
    const dialog = screen.getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' });
    expect(within(dialog).getByRole('button', { name: 'Publicar' }).className).toContain(
      'bg-error',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Publicar' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Build de exemplo-a enfileirado.'),
    );
    expect(publish).toHaveBeenCalledWith('exemplo-a');
    expect(headerAlert().textContent).toBe('');
  });

  it('Cancelar e Esc não publicam e devolvem o foco ao botão', async () => {
    const user = userEvent.setup();
    const publish = ok('');
    renderOperations({ publish });
    const button = screen.getByRole('button', { name: 'Publicar agora exemplo-a' });

    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
    await user.keyboard('{Enter}');
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
    expect(publish).not.toHaveBeenCalled();
  });

  it('a recusa vai ao Alert logo abaixo do cabeçalho', async () => {
    const user = userEvent.setup();
    renderOperations({ publish: refused('Site pausado: não publica.') });

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publicar' }),
    );

    await waitFor(() => expect(headerAlert().textContent).toBe('Site pausado: não publica.'));
    expect(headerAlert().getAttribute('role')).toBe('alert');
    expect(headerAlert().querySelector('.alert')).not.toBeNull();
  });

  it('pausado, "Retomar" no lugar de "Publicar agora", com a confirmação de hoje', async () => {
    const user = userEvent.setup();
    const resume = ok('exemplo-a retomado; build enfileirado.');
    renderOperations({ paused: true, publish: ok(''), resume });
    expect(screen.queryByRole('button', { name: /Publicar agora/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retomar exemplo-a' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Retomar exemplo-a?' });
    expect(dialog.textContent).toContain('O site volta a receber builds');
    await user.click(within(dialog).getByRole('button', { name: 'Retomar' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('exemplo-a retomado; build enfileirado.'),
    );
    expect(resume).toHaveBeenCalledWith('exemplo-a');
  });

  it('enquanto a ação está na fila, o botão diz e fica aria-disabled', async () => {
    const user = userEvent.setup();
    let resolve: (result: ActionResult) => void = () => {};
    const publish = vi.fn(
      (): Promise<ActionResult> =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderOperations({ publish });

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publicar' }),
    );
    const pending = await screen.findByRole('button', { name: 'Enfileirando… exemplo-a' });
    expect(pending.getAttribute('aria-disabled')).toBe('true');
    await user.click(pending);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    act(() => resolve({ ok: true, message: 'ok' }));
    expect(await screen.findByRole('button', { name: 'Publicar agora exemplo-a' })).toBeTruthy();
  });

  it('sem as ações (editor, revisor), nada aparece', () => {
    renderOperations({ paused: true });
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Mais ações', () => {
  it('só com reconstruir ou reverter; os dois itens na ordem', async () => {
    const user = userEvent.setup();
    const { rerender } = renderOperations({ publish: ok('') });
    expect(screen.queryByRole('button', { name: 'Mais ações: exemplo-a' })).toBeNull();

    rerender(
      <Operations
        publish={ok('')}
        rebuild={{ releases: RELEASES, action: ok('') }}
        rollback={{ versions: VERSIONS, action: ok('') }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Mais ações: exemplo-a' }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['Reconstruir na release', 'Reverter']);
  });

  it('"Reconstruir na release" abre o diálogo de hoje e roda a action com a release', async () => {
    const user = userEvent.setup();
    const action = ok('Build enfileirado.');
    renderOperations({ paused: true, rebuild: { releases: RELEASES, action } });

    await chooseFromMenu(user, 'Reconstruir na release');
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reconstruir o site numa release?',
    });
    expect(dialog.textContent).toContain('O site sai da pausa.');
    await user.click(within(dialog).getByRole('button', { name: 'Reconstruir' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Build enfileirado.'));
    expect(action).toHaveBeenCalledWith('1.3.0');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Mais ações: exemplo-a' }),
      ),
    );
  });

  it('"Reverter" abre o diálogo de hoje; a recusa vai ao Alert do cabeçalho', async () => {
    const user = userEvent.setup();
    const action = refused('A versão já está no ar');
    renderOperations({ rollback: { versions: VERSIONS, action } });

    await chooseFromMenu(user, 'Reverter');
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reverter o site para uma versão anterior?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Reverter' }));

    await waitFor(() => expect(headerAlert().textContent).toBe('A versão já está no ar'));
    expect(action).toHaveBeenCalledWith('20261010T120000Z-bbbbbbbb');
    expect(screen.queryByRole('status')?.textContent ?? '').toBe('');
  });

  it('Cancelar não roda a ação e devolve o foco ao Mais ações', async () => {
    const user = userEvent.setup();
    const action = ok('');
    renderOperations({ rollback: { versions: VERSIONS, action } });

    await chooseFromMenu(user, 'Reverter');
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Mais ações: exemplo-a' }),
      ),
    );
  });

  it('fora do SiteOperationsScope, falha', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<SiteOperations siteId="exemplo-a" paused={false} release={null} timeZone="UTC" />),
    ).toThrow('SiteOperations fora de um SiteOperationsScope.');
    vi.restoreAllMocks();
  });
});
