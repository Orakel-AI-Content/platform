// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import type { MediaItem } from '@/components/media/MediaLibrary.tsx';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp.ts';
import { entityField, mediaField, type MediaSource } from './PickerFields.tsx';
import { SchemaForm } from './SchemaForm.tsx';

// Seletores de mídia e de entidades no gerador (#45): só o que existe no site, por teclado. A
// mídia é escolhida pela grade de miniaturas (#182), com a miniatura do valor atual por ID.

// A mensagem de erro do FormItem (#245) anima com o motion, que o happy-dom cancela no `cleanup`.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

// O seletor de imagem é o Dialog do Ecme (#280): o react-modal esconde o contêiner da app.
let app: HTMLElement;

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

const schema = z.object({
  mediaId: z.number().int().positive(),
  coverMediaId: z.number().int().positive().optional(),
  authorIds: z.array(z.number().int().positive()),
});

const thumb = (id: number, width: number, height: number): MediaItem => ({
  id,
  width,
  height,
  sources: [],
  src: `https://media.exemplo-a.test/${id}.webp`,
});
const library = [thumb(1, 1200, 800), thumb(2, 800, 600)];

/** Biblioteca falsa: uma página só, e a leitura por IDs. */
function fakeSource(): MediaSource & { byIds: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn((page: number) =>
      Promise.resolve({ items: library, total: library.length, page, pageSize: 24 }),
    ),
    byIds: vi.fn((ids: number[]) =>
      Promise.resolve(library.filter((item) => ids.includes(item.id))),
    ),
  };
}
const authors = [
  { id: 1, label: 'Ana' },
  { id: 2, label: 'Bia' },
  { id: 3, label: 'Caio' },
];

function renderForm(
  onSubmit = vi.fn(),
  authorOptions = authors,
  defaults: Record<string, unknown> = { mediaId: undefined, authorIds: [3] },
  media = fakeSource(),
) {
  render(
    <SchemaForm
      schema={schema}
      defaultValues={defaults}
      labels={{ mediaId: 'Mídia', coverMediaId: 'Capa', authorIds: 'Autores' }}
      fields={{
        mediaId: mediaField(media),
        coverMediaId: mediaField(media, { optional: true }),
        authorIds: entityField(authorOptions, 'Nenhum autor cadastrado.'),
      }}
      submitLabel="Salvar"
      onSubmit={onSubmit}
    />,
    { container: app },
  );
  return { onSubmit, media };
}

// O seletor é o Dialog do Ecme (#280), num portal fora do grupo do campo.
const picker = () => screen.getByRole('dialog', { name: 'Escolher imagem' });

describe('seletores', () => {
  it('mídia vazia mostra "Nenhuma imagem"; a obrigatória vazia é recusada no campo', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    const field = screen.getByRole('group', { name: 'Mídia' });
    expect(within(field).getByText('Nenhuma imagem')).toBeTruthy();
    expect(within(field).getByRole('button', { name: 'Escolher imagem' })).toBeTruthy();
    expect(within(field).queryByRole('button', { name: 'Remover' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('escolher na grade mostra a miniatura, fecha e devolve o foco ao botão do campo', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    const field = screen.getByRole('group', { name: 'Mídia' });
    const choose = within(field).getByRole('button', { name: 'Escolher imagem' });
    await user.click(choose);
    const option = await within(picker()).findByRole('button', {
      name: 'Mídia 2 · 800×600',
    });
    option.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(field).getByText('Mídia 2 · 800×600', { selector: 'p' })).toBeTruthy();
    const change = within(field).getByRole('button', { name: 'Trocar' });
    expect(document.activeElement).toBe(change);

    const group = screen.getByRole('group', { name: 'Autores' });
    within(group).getByRole('checkbox', { name: 'Ana' }).focus();
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ mediaId: 2, authorIds: [1, 3] });
  });

  it('ao reabrir um valor salvo, a miniatura vem da leitura por ID', async () => {
    const { media } = renderForm(vi.fn(), authors, { mediaId: 1, coverMediaId: 2, authorIds: [] });

    const field = screen.getByRole('group', { name: 'Mídia' });
    expect(await within(field).findByText('Mídia 1 · 1200×800', { selector: 'p' })).toBeTruthy();
    expect(field.querySelector('img')?.getAttribute('src')).toBe(
      'https://media.exemplo-a.test/1.webp',
    );
    expect(media.byIds).toHaveBeenCalledWith([1]);
    expect(within(field).getByRole('button', { name: 'Trocar' })).toBeTruthy();
  });

  it('a opcional tem "Remover", que deixa o campo vazio e leva o foco a "Escolher imagem"', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(vi.fn(), authors, {
      mediaId: 1,
      coverMediaId: 2,
      authorIds: [],
    });

    const cover = screen.getByRole('group', { name: 'Capa' });
    await within(cover).findByText('Mídia 2 · 800×600', { selector: 'p' });
    // A obrigatória não tem "Remover".
    expect(
      within(screen.getByRole('group', { name: 'Mídia' })).queryByRole('button', {
        name: 'Remover',
      }),
    ).toBeNull();
    // Remover confirma num diálogo (#327): Cancelar mantém a imagem e devolve o foco ao botão.
    const remove = within(cover).getByRole('button', { name: 'Remover' });
    expect(remove.className).toContain('text-error');
    await user.click(remove);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(remove);
    expect(within(cover).queryByText('Nenhuma imagem')).toBeNull();
    await user.click(remove);
    const dialog = screen.getByRole('alertdialog', { name: 'Remover a imagem de Capa?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    expect(within(cover).getByText('Nenhuma imagem')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(cover).getByRole('button', { name: 'Escolher imagem' }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ mediaId: 1, authorIds: [] });
  });

  it('o erro da mídia obrigatória leva o foco ao botão do campo pelo resumo', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const summary = screen.getByRole('alert');
    await user.click(await within(summary).findByRole('button', { name: /^Mídia: / }));

    expect(document.activeElement).toBe(
      within(screen.getByRole('group', { name: 'Mídia' })).getByRole('button', {
        name: 'Escolher imagem',
      }),
    );
  });

  it('sem entidades cadastradas mostra o aviso', () => {
    renderForm(vi.fn(), []);

    expect(screen.getByText('Nenhum autor cadastrado.')).toBeTruthy();
  });
});
