// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaDetails } from './media-details.tsx';
import type { MediaItem } from './media-library.tsx';

// Detalhes de uma imagem (#187): o botão da imagem abre o diálogo com dimensões, formatos e
// identificador; "Copiar identificador" confirma (ou explica a falha) em role="status"; Esc
// fecha e o foco volta à imagem. O Esc nativo é o evento `cancel` seguido de `close`.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item: MediaItem = {
  id: 42,
  width: 1600,
  height: 900,
  sources: [{ type: 'image/avif', url: 'https://media.exemplo-a.test/h-320.avif' }],
  src: 'https://media.exemplo-a.test/h-320.webp',
  originalName: 'Praia ação 01.jpg',
  uploadedAt: '2026-10-01T15:30:00.000Z',
  formats: ['avif', 'webp'],
};

function renderDetails(media: MediaItem = item) {
  render(<MediaDetails item={media} timeZone="America/Sao_Paulo" />);
  const trigger = screen.getByRole('button', { name: /Praia ação 01\.jpg|Sem nome/ });
  const dialog = document.querySelector('dialog') as HTMLDialogElement;
  return { trigger, dialog };
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const clipboard = { writeText: vi.fn(writeText) };
  vi.stubGlobal('navigator', { ...navigator, clipboard });
  return clipboard;
}

describe('detalhes da imagem', () => {
  it('a imagem é um botão; ativar abre os detalhes com dimensões, formatos e identificador', async () => {
    const user = userEvent.setup();
    const { trigger, dialog } = renderDetails();

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.textContent).toBe('Praia ação 01.jpg · 01/10/2026, 12:30 BRT');
    await user.click(trigger);

    expect(dialog.open).toBe(true);
    const details = within(dialog);
    expect(details.getByRole('heading', { level: 2 }).textContent).toBe('Praia ação 01.jpg');
    const terms = [...dialog.querySelectorAll('dt')].map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    expect(terms).toEqual([
      ['Dimensões', '1600×900 px'],
      ['Formatos disponíveis', 'AVIF, WebP'],
      ['Identificador', '42'],
      ['Enviada em', '01/10/2026, 12:30 BRT'],
    ]);
  });

  it.each([['{Enter}'], [' ']])('%s no botão da imagem também abre', async (key) => {
    const user = userEvent.setup();
    const { trigger, dialog } = renderDetails();

    trigger.focus();
    await user.keyboard(key);

    expect(dialog.open).toBe(true);
  });

  it('copiar põe o identificador na área de transferência e confirma em role="status"', async () => {
    const user = userEvent.setup();
    const clipboard = stubClipboard(() => Promise.resolve());
    const { trigger, dialog } = renderDetails();

    await user.click(trigger);
    await user.click(within(dialog).getByRole('button', { name: 'Copiar identificador' }));

    expect(clipboard.writeText).toHaveBeenCalledWith('42');
    await waitFor(() =>
      expect(within(dialog).getByRole('status').textContent).toBe('Identificador copiado.'),
    );
  });

  it('cópia recusada mostra o erro, com o identificador, na mesma região', async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new Error('NotAllowedError')));
    const { trigger, dialog } = renderDetails();

    await user.click(trigger);
    await user.click(within(dialog).getByRole('button', { name: 'Copiar identificador' }));

    const status = within(dialog).getByRole('status');
    await waitFor(() =>
      expect(status.textContent).toBe('Não foi possível copiar; o identificador é 42.'),
    );
    expect(status.className).toContain('text-destructive');
  });

  it('Esc fecha, devolve o foco à imagem e limpa a mensagem', async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.resolve());
    const { trigger, dialog } = renderDetails();

    trigger.focus();
    await user.keyboard('{Enter}');
    within(dialog).getByRole('button', { name: 'Copiar identificador' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(within(dialog).getByRole('status').textContent).toBe('Identificador copiado.'),
    );
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    dialog.close();

    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    await waitFor(() =>
      expect(within(dialog).getByRole('status', { hidden: true }).textContent).toBe(''),
    );
  });

  it('sem envio registrado, usa os textos de reserva; "Fechar" também devolve o foco', async () => {
    const user = userEvent.setup();
    const { trigger, dialog } = renderDetails({
      ...item,
      originalName: null,
      uploadedAt: null,
      formats: undefined,
    });

    expect(trigger.textContent).toBe('Sem nome (Mídia 42) · Data de envio não registrada');
    await user.click(trigger);
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(
      'Sem nome (Mídia 42)',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }));

    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
