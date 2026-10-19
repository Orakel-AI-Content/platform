// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp.ts';
import { MediaDetails } from './MediaDetails.tsx';
import type { MediaItem } from './MediaLibrary.tsx';

// Detalhes de uma imagem (#187, no Dialog do Ecme desde #279): o botão da imagem abre o
// diálogo com dimensões, formatos e identificador; "Copiar identificador" confirma (ou explica
// a falha) em role="status"; Esc e "Fechar" fecham e o foco volta à imagem.

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
  render(<MediaDetails item={media} timeZone="America/Sao_Paulo" />, { container: app });
  const trigger = screen.getByRole('button', { name: /Praia ação 01\.jpg|Sem nome/ });
  return { trigger };
}

const dialog = (name: string | RegExp = /Praia ação 01\.jpg|Sem nome/) =>
  screen.getByRole('dialog', { name });

async function expectClosed() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const clipboard = { writeText: vi.fn(writeText) };
  vi.stubGlobal('navigator', { ...navigator, clipboard });
  return clipboard;
}

describe('detalhes da imagem', () => {
  it('a imagem é um botão; ativar abre os detalhes com dimensões, formatos e identificador', async () => {
    const user = userEvent.setup();
    const { trigger } = renderDetails();

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.textContent).toBe('Praia ação 01.jpg · 01/10/2026, 12:30 BRT');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(trigger);

    const details = within(dialog('Praia ação 01.jpg'));
    expect(details.getByRole('heading', { level: 2 }).textContent).toBe('Praia ação 01.jpg');
    const terms = details
      .getAllByRole('term')
      .map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(terms).toEqual([
      ['Dimensões', '1600×900 px'],
      ['Formatos disponíveis', 'AVIF, WebP'],
      ['Identificador', '42'],
      ['Enviada em', '01/10/2026, 12:30 BRT'],
    ]);
    expect(details.getAllByRole('button', { name: 'Fechar' })).toHaveLength(1);
  });

  it.each([['{Enter}'], [' ']])('%s no botão da imagem também abre', async (key) => {
    const user = userEvent.setup();
    const { trigger } = renderDetails();

    trigger.focus();
    await user.keyboard(key);

    expect(dialog()).toBeTruthy();
  });

  it('o foco fica preso no diálogo, e a app por trás fica inerte', async () => {
    const user = userEvent.setup();
    const { trigger } = renderDetails();

    await user.click(trigger);
    const details = dialog();
    expect(app.getAttribute('aria-hidden')).toBe('true');
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(details.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(details.contains(document.activeElement)).toBe(true);
  });

  it('copiar põe o identificador na área de transferência e confirma em role="status"', async () => {
    const user = userEvent.setup();
    const clipboard = stubClipboard(() => Promise.resolve());
    const { trigger } = renderDetails();

    await user.click(trigger);
    const details = within(dialog());
    await user.click(details.getByRole('button', { name: 'Copiar identificador' }));

    expect(clipboard.writeText).toHaveBeenCalledWith('42');
    await waitFor(() =>
      expect(details.getByRole('status').textContent).toBe('Identificador copiado.'),
    );
    expect(details.getByRole('status').className).not.toContain('text-error');
  });

  it('cópia recusada mostra o erro, com o identificador, na mesma região', async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new Error('NotAllowedError')));
    const { trigger } = renderDetails();

    await user.click(trigger);
    const details = within(dialog());
    await user.click(details.getByRole('button', { name: 'Copiar identificador' }));

    const status = details.getByRole('status');
    await waitFor(() =>
      expect(status.textContent).toBe('Não foi possível copiar; o identificador é 42.'),
    );
    expect(status.className).toContain('text-error');
  });

  it('Esc fecha, devolve o foco à imagem e limpa a mensagem', async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.resolve());
    const { trigger } = renderDetails();

    trigger.focus();
    await user.keyboard('{Enter}');
    const details = within(dialog());
    details.getByRole('button', { name: 'Copiar identificador' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(details.getByRole('status').textContent).toBe('Identificador copiado.'),
    );
    await user.keyboard('{Escape}');

    await expectClosed();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    expect(within(dialog()).getByRole('status').textContent).toBe('');
  });

  it('sem envio registrado, usa os textos de reserva; "Fechar" também devolve o foco', async () => {
    const user = userEvent.setup();
    const { trigger } = renderDetails({
      ...item,
      originalName: null,
      uploadedAt: null,
      formats: undefined,
    });

    expect(trigger.textContent).toBe('Sem nome (Mídia 42) · Data de envio não registrada');
    await user.click(trigger);
    const details = within(dialog('Sem nome (Mídia 42)'));
    expect(details.getByRole('heading', { level: 2 }).textContent).toBe('Sem nome (Mídia 42)');
    expect(details.getAllByRole('definition')[1]?.textContent).toBe('—');
    await user.click(details.getByRole('button', { name: 'Fechar' }));

    await expectClosed();
    expect(document.activeElement).toBe(trigger);
  });
});
