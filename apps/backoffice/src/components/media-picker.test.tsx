// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from './ui/utils/modalApp.ts';
import type { MediaItem } from './media-library.tsx';
import { MediaPicker, type MediaPickerPage } from './media-picker.tsx';

// Diálogo de grade de miniaturas (#181, no Dialog do Ecme desde #280): a página do carregador,
// a `Pagination` com as pontas desabilitadas, escolha por clique e teclado, Esc e "Fechar", o
// foco preso no diálogo e de volta ao botão que abriu. O comportamento real do navegador fica
// no E2E da #182, que liga a grade ao formulário.

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

const item = (id: number): MediaItem => ({
  id,
  width: 800,
  height: 600,
  sources: [{ type: 'image/avif', url: `https://media.exemplo-a.test/${id}.avif` }],
  src: `https://media.exemplo-a.test/${id}.webp`,
});

/** Biblioteca de `total` mídias, em páginas de `pageSize`. */
function library(total: number, pageSize = 2) {
  return vi.fn((page: number): Promise<MediaPickerPage | null> => {
    const ids = Array.from({ length: total }, (_, index) => index + 1);
    return Promise.resolve({
      items: ids.slice((page - 1) * pageSize, page * pageSize).map(item),
      total,
      page,
      pageSize,
    });
  });
}

function renderPicker(load: (page: number) => Promise<MediaPickerPage | null>) {
  const onSelect = vi.fn();
  render(<MediaPicker label="Escolher imagem" load={load} onSelect={onSelect} />, {
    container: app,
  });
  const trigger = screen.getByRole('button', { name: 'Escolher imagem' });
  return { onSelect, trigger };
}

const dialog = () => screen.getByRole('dialog', { name: 'Escolher imagem' });
const inDialog = () => within(dialog());

async function expectClosed() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('grade de miniaturas', () => {
  it('abrir mostra a primeira página e o total; a paginação desabilita as pontas', async () => {
    const user = userEvent.setup();
    const load = library(5);
    const { trigger } = renderPicker(load);

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(trigger);

    expect(inDialog().getByRole('heading', { level: 2 }).textContent).toBe('Escolher imagem');
    expect(load).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(inDialog().getByRole('status').textContent).toBe('Página 1 de 3 · 5 imagens'),
    );
    const pagination = within(inDialog().getByRole('navigation', { name: 'Paginação' }));
    const previous = () => pagination.getByRole('button', { name: 'Página anterior' });
    const next = () => pagination.getByRole('button', { name: 'Próxima página' });
    expect(previous()).toHaveProperty('disabled', true);
    expect(next()).toHaveProperty('disabled', false);
    expect(pagination.getByRole('button', { name: 'Página 1' }).getAttribute('aria-current')).toBe(
      'page',
    );

    await user.click(next());
    await inDialog().findByRole('button', { name: /^Mídia 3 / });
    await user.click(next());
    await waitFor(() =>
      expect(inDialog().getByRole('status').textContent).toBe('Página 3 de 3 · 5 imagens'),
    );
    const bottom = within(inDialog().getByRole('navigation', { name: 'Paginação' }));
    expect(bottom.getByRole('button', { name: 'Próxima página' })).toHaveProperty('disabled', true);
    expect(bottom.getByRole('button', { name: 'Página anterior' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(load).toHaveBeenLastCalledWith(3);
    expect(
      inDialog()
        .getAllByRole('button', { name: /^Mídia / })
        .map((button) => button.textContent),
    ).toEqual(['Mídia 5 · 800×600']);
  });

  it('cada miniatura é um botão "Mídia N · L×A"; Enter escolhe, fecha e devolve o foco', async () => {
    const user = userEvent.setup();
    const { onSelect, trigger } = renderPicker(library(3));

    await user.click(trigger);
    const second = await inDialog().findByRole('button', { name: 'Mídia 2 · 800×600' });
    expect(second.querySelector('img')?.getAttribute('alt')).toBe('');
    second.focus();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(2, expect.objectContaining({ id: 2, width: 800 }));
    await expectClosed();
    expect(document.activeElement).toBe(trigger);
  });

  it('Espaço também escolhe; clique também', async () => {
    const user = userEvent.setup();
    const { onSelect, trigger } = renderPicker(library(3));

    await user.click(trigger);
    (await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' })).focus();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenLastCalledWith(1, expect.objectContaining({ id: 1 }));
    await expectClosed();

    await user.click(trigger);
    await user.click(await inDialog().findByRole('button', { name: 'Mídia 2 · 800×600' }));
    expect(onSelect).toHaveBeenLastCalledWith(2, expect.objectContaining({ id: 2 }));
    await expectClosed();
    expect(document.activeElement).toBe(trigger);
  });

  it('Esc fecha sem escolher e o foco volta ao botão', async () => {
    const user = userEvent.setup();
    const { onSelect, trigger } = renderPicker(library(3));

    trigger.focus();
    await user.keyboard('{Enter}');
    await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' });
    await user.keyboard('{Escape}');

    await expectClosed();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('"Fechar" fecha sem escolher e o foco volta ao botão', async () => {
    const user = userEvent.setup();
    const { onSelect, trigger } = renderPicker(library(3));

    await user.click(trigger);
    await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' });
    expect(inDialog().getAllByRole('button', { name: 'Fechar' })).toHaveLength(1);
    await user.click(inDialog().getByRole('button', { name: 'Fechar' }));

    await expectClosed();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('o foco fica preso no diálogo, e a app por trás fica inerte', async () => {
    const user = userEvent.setup();
    const { trigger } = renderPicker(library(5));

    await user.click(trigger);
    await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' });
    expect(app.getAttribute('aria-hidden')).toBe('true');
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog().contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it('a ordem dos controles é "Fechar", as miniaturas e a paginação', async () => {
    // A ordem real do Tab (o react-modal prende o foco) fica no E2E do editor: o happy-dom não
    // tem layout, e o react-modal não acha nada tabulável sem ele.
    const user = userEvent.setup();
    const { trigger } = renderPicker(library(5));

    await user.click(trigger);
    await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' });
    expect(
      inDialog()
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual([
      'Fechar',
      'Mídia 1 · 800×600',
      'Mídia 2 · 800×600',
      'Página anterior',
      'Página 1',
      'Página 2',
      'Página 3',
      'Próxima página',
    ]);
  });

  it('trocar de página mantém a grade e a paginação até a resposta; só a mais recente vale', async () => {
    const user = userEvent.setup();
    const pending = new Map<number, (page: MediaPickerPage) => void>();
    const loaded = library(6);
    const load = vi.fn((page: number) =>
      page === 1
        ? loaded(1)
        : new Promise<MediaPickerPage | null>((resolve) => pending.set(page, resolve)),
    );
    const { trigger } = renderPicker(load);

    await user.click(trigger);
    await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' });
    const next = inDialog().getByRole('button', { name: 'Próxima página' });
    await user.click(next);

    expect(inDialog().getByRole('status').textContent).toBe('Carregando…');
    expect(inDialog().getByRole('button', { name: 'Mídia 1 · 800×600' })).toBeTruthy();
    expect(document.activeElement).toBe(next);

    await user.click(inDialog().getByRole('button', { name: 'Página 3' }));
    const page = (n: number) => ({ items: [item(n * 2 - 1)], total: 6, page: n, pageSize: 2 });
    pending.get(3)?.(page(3));
    await inDialog().findByRole('button', { name: 'Mídia 5 · 800×600' });
    // A resposta atrasada da página 2 chega depois e é descartada.
    await act(() => {
      pending.get(2)?.(page(2));
      return Promise.resolve();
    });
    expect(inDialog().getByRole('status').textContent).toBe('Página 3 de 3 · 6 imagens');
    expect(inDialog().queryByRole('button', { name: 'Mídia 3 · 800×600' })).toBeNull();
  });

  it('biblioteca vazia e falha do carregador aparecem no status', async () => {
    const user = userEvent.setup();
    const empty = renderPicker(library(0));
    await user.click(empty.trigger);
    await waitFor(() =>
      expect(inDialog().getByRole('status').textContent).toBe('Nenhuma imagem na biblioteca.'),
    );
    expect(inDialog().queryByRole('navigation', { name: 'Paginação' })).toBeNull();
    cleanup();
    document.body.append(app);

    const failing = renderPicker(vi.fn(() => Promise.resolve(null)));
    await user.click(failing.trigger);
    await waitFor(() =>
      expect(inDialog().getByRole('status').textContent).toBe(
        'Não foi possível carregar as imagens.',
      ),
    );
    expect(inDialog().queryByRole('navigation', { name: 'Paginação' })).toBeNull();
  });

  it('buttonRef recebe o botão que abre (foco vindo de fora)', () => {
    const buttonRef = vi.fn();
    render(
      <MediaPicker label="Trocar" load={library(1)} onSelect={vi.fn()} buttonRef={buttonRef} />,
      { container: app },
    );

    expect(buttonRef).toHaveBeenCalledWith(screen.getByRole('button', { name: 'Trocar' }));
  });
});
