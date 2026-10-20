// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp.ts';
import { MediaUpload } from './MediaUpload.tsx';

// Envio de imagens (#376), no UploadFile do FileManager do Ecme: "Enviar imagens" abre o
// diálogo com o Upload arrastável; escolher ou soltar entrega à fila só os arquivos novos e
// fecha o diálogo; Esc, o fundo e o X "Fechar" também fecham, e o foco volta ao botão.

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

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

const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

function renderUpload() {
  const onAdd = vi.fn<(files: File[]) => void>();
  render(<MediaUpload accept={ACCEPT} onAdd={onAdd} />, { container: app });
  const trigger = screen.getByRole('button', { name: 'Enviar imagens' });
  return { onAdd, trigger };
}

const dialog = () => screen.getByRole('dialog', { name: 'Enviar imagens' });
const fileInput = () => within(dialog()).getByLabelText<HTMLInputElement>(/^Solte as imagens aqui/);

async function expectClosed(trigger: HTMLElement) {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
}

describe('envio de imagens', () => {
  it('"Enviar imagens" abre o diálogo com o título e a área de soltar, que nomeia o campo', async () => {
    const user = userEvent.setup();
    const { trigger } = renderUpload();

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(trigger);

    expect(
      within(dialog()).getByRole('heading', { level: 4, name: 'Enviar imagens' }),
    ).toBeTruthy();
    const input = fileInput();
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe(ACCEPT);
    const name = document.getElementById(input.getAttribute('aria-labelledby') ?? '')?.textContent;
    for (const part of ['JPEG', 'PNG', 'WebP', 'AVIF', '25 MB']) expect(name).toContain(part);
    expect(dialog().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('escolher pelo teclado entrega os arquivos, fecha e devolve o foco ao botão', async () => {
    const user = userEvent.setup();
    const { onAdd, trigger } = renderUpload();
    trigger.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true));

    // O campo cobre a área e entra no Tab (o percurso real do Tab é coberto no E2E: o react-modal
    // não acha os focáveis sem layout no happy-dom); Enter nele abre o seletor do navegador.
    expect(fileInput().tabIndex).toBe(0);
    expect(fileInput().disabled).toBe(false);
    fileInput().focus();
    await user.upload(fileInput(), [image('a.jpg'), image('b.jpg')]);

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd.mock.calls[0]?.[0].map((file) => file.name)).toEqual(['a.jpg', 'b.jpg']);
    await expectClosed(trigger);
  });

  it('soltar na área entrega os arquivos soltos', async () => {
    const user = userEvent.setup();
    const { onAdd, trigger } = renderUpload();
    await user.click(trigger);

    // Soltar sobre o input que cobre a área: o navegador põe os arquivos nele e dispara change.
    const input = fileInput();
    fireEvent.drop(input.parentElement as HTMLElement);
    fireEvent.change(input, { target: { files: [image('solta.jpg')] } });

    expect(onAdd.mock.calls[0]?.[0].map((file) => file.name)).toEqual(['solta.jpg']);
    await expectClosed(trigger);
  });

  it('escolher duas vezes seguidas entrega só os arquivos da segunda escolha', async () => {
    const user = userEvent.setup();
    const { onAdd, trigger } = renderUpload();

    await user.click(trigger);
    await user.upload(fileInput(), [image('primeira.jpg')]);
    await expectClosed(trigger);
    await user.click(trigger);
    await user.upload(fileInput(), [image('segunda-a.jpg'), image('segunda-b.jpg')]);

    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd.mock.calls[1]?.[0].map((file) => file.name)).toEqual([
      'segunda-a.jpg',
      'segunda-b.jpg',
    ]);
  });

  it.each([
    [
      'o X "Fechar"',
      (user: ReturnType<typeof userEvent.setup>) =>
        user.click(within(dialog()).getByRole('button', { name: 'Fechar' })),
    ],
    ['Esc', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    [
      'o fundo',
      () => {
        fireEvent.click(document.querySelector('.dialog-overlay') as HTMLElement);
        return Promise.resolve();
      },
    ],
  ])('%s fecha sem entregar nada e devolve o foco ao botão', async (_, close) => {
    const user = userEvent.setup();
    const { onAdd, trigger } = renderUpload();
    await user.click(trigger);

    await close(user);

    await expectClosed(trigger);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
