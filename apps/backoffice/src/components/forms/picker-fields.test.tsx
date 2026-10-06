// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { entityField, mediaField } from './picker-fields.tsx';
import { SchemaForm } from './schema-form.tsx';

// Seletores de mídia e de entidades no gerador (#45): só o que existe no site, por teclado.

afterEach(cleanup);

const schema = z.object({
  mediaId: z.number().int().positive(),
  coverMediaId: z.number().int().positive().optional(),
  authorIds: z.array(z.number().int().positive()),
});

const media = [
  { id: 1, label: 'Mídia 1 (1200×800)' },
  { id: 2, label: 'Mídia 2 (800×600)' },
];
const authors = [
  { id: 1, label: 'Ana' },
  { id: 2, label: 'Bia' },
  { id: 3, label: 'Caio' },
];

function renderForm(onSubmit = vi.fn(), authorOptions = authors) {
  render(
    <SchemaForm
      schema={schema}
      defaultValues={{ mediaId: undefined, authorIds: [3] }}
      labels={{ mediaId: 'Mídia', coverMediaId: 'Capa', authorIds: 'Autores' }}
      fields={{
        mediaId: mediaField(media),
        coverMediaId: mediaField(media, { optional: true }),
        authorIds: entityField(authorOptions, 'Nenhum autor cadastrado.'),
      }}
      submitLabel="Salvar"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe('seletores', () => {
  it('a mídia só oferece as do site; a obrigatória vazia é recusada', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    const select = screen.getByLabelText('Mídia');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Escolha uma mídia', 'Mídia 1 (1200×800)', 'Mídia 2 (800×600)']);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(select.getAttribute('aria-invalid')).toBe('true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('escolhe mídia e autores pelo teclado e envia os IDs', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.selectOptions(screen.getByLabelText('Mídia'), 'Mídia 2 (800×600)');
    const group = screen.getByRole('group', { name: 'Autores' });
    within(group).getByRole('checkbox', { name: 'Ana' }).focus();
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ mediaId: 2, authorIds: [1, 3] });
  });

  it('sem entidades cadastradas mostra o aviso', () => {
    renderForm(vi.fn(), []);

    expect(screen.getByText('Nenhum autor cadastrado.')).toBeTruthy();
  });
});
