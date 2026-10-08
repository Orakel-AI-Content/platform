// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MediaItem } from './media-library.tsx';
import { MediaPicker, type MediaPickerPage } from './media-picker.tsx';

// Diálogo de grade de miniaturas (#181): a página do carregador, Anterior/Próxima nas pontas,
// escolha por clique e teclado, Esc e o foco de volta ao botão que abriu. O happy-dom tem
// `showModal`/`close`; o Esc nativo é o evento `cancel` seguido de `close`, disparado aqui.
// O comportamento real do navegador fica no E2E da #182, que liga a grade ao formulário.

afterEach(cleanup);

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
  render(<MediaPicker label="Escolher imagem" load={load} onSelect={onSelect} />);
  const trigger = screen.getByRole('button', { name: 'Escolher imagem' });
  return { onSelect, trigger };
}

const dialogEl = () => document.querySelector('dialog') as HTMLDialogElement;
const inDialog = () => within(dialogEl());

describe('grade de miniaturas', () => {
  it('abrir mostra a primeira página e o total; Anterior/Próxima nas pontas', async () => {
    const user = userEvent.setup();
    const load = library(5);
    const { trigger } = renderPicker(load);

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    await user.click(trigger);

    expect(dialogEl().open).toBe(true);
    expect(load).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(inDialog().getByRole('status').textContent).toBe('Página 1 de 3 · 5 imagens'),
    );
    const previous = inDialog().getByRole('button', { name: 'Anterior' });
    const next = inDialog().getByRole('button', { name: 'Próxima' });
    expect(previous).toHaveProperty('disabled', true);
    expect(next).toHaveProperty('disabled', false);

    await user.click(next);
    await inDialog().findByRole('button', { name: /^Mídia 3 / });
    await user.click(next);
    await waitFor(() =>
      expect(inDialog().getByRole('status').textContent).toBe('Página 3 de 3 · 5 imagens'),
    );
    expect(next).toHaveProperty('disabled', true);
    expect(previous).toHaveProperty('disabled', false);
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

    expect(onSelect).toHaveBeenCalledWith(2);
    expect(dialogEl().open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('Espaço também escolhe; clique também', async () => {
    const user = userEvent.setup();
    const { onSelect, trigger } = renderPicker(library(3));

    await user.click(trigger);
    (await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' })).focus();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenLastCalledWith(1);

    await user.click(trigger);
    await user.click(await inDialog().findByRole('button', { name: 'Mídia 2 · 800×600' }));
    expect(onSelect).toHaveBeenLastCalledWith(2);
    expect(dialogEl().open).toBe(false);
  });

  it('Esc (cancel) fecha sem escolher e o foco volta ao botão', async () => {
    const user = userEvent.setup();
    const { onSelect, trigger } = renderPicker(library(3));

    await user.click(trigger);
    await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' });
    dialogEl().dispatchEvent(new Event('cancel', { cancelable: true }));
    dialogEl().close();

    expect(onSelect).not.toHaveBeenCalled();
    expect(dialogEl().open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('a grade é toda operável com Tab: miniaturas e paginação, na ordem', async () => {
    const user = userEvent.setup();
    const { trigger } = renderPicker(library(5));

    await user.click(trigger);
    const first = await inDialog().findByRole('button', { name: 'Mídia 1 · 800×600' });
    inDialog().getByRole('button', { name: 'Fechar' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(first);
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Mídia 2 · 800×600');
    // "Anterior" está desabilitado na primeira página: o Tab vai direto a "Próxima".
    await user.tab();
    expect(document.activeElement).toBe(inDialog().getByRole('button', { name: 'Próxima' }));
  });

  it('biblioteca vazia e falha do carregador aparecem no status', async () => {
    const user = userEvent.setup();
    const empty = renderPicker(library(0));
    await user.click(empty.trigger);
    await waitFor(() =>
      expect(inDialog().getByRole('status').textContent).toBe('Nenhuma imagem na biblioteca.'),
    );
    expect(inDialog().getByRole('button', { name: 'Próxima' })).toHaveProperty('disabled', true);
    cleanup();

    const failing = renderPicker(vi.fn(() => Promise.resolve(null)));
    await user.click(failing.trigger);
    await waitFor(() =>
      expect(inDialog().getByRole('status').textContent).toBe(
        'Não foi possível carregar as imagens.',
      ),
    );
  });
});
