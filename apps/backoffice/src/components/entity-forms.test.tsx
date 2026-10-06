// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityForm, type EntityFormResult } from './entity-forms.tsx';

// Formulários de entidades (#46): rótulos por tipo, recusa no campo e volta para a lista.

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ok: EntityFormResult = { ok: true, message: 'Salvo.' };

describe('formulários de entidades', () => {
  it('autor: cria com a foto escolhida e volta para a lista', async () => {
    const user = userEvent.setup();
    const action = vi.fn<(value: unknown) => Promise<EntityFormResult>>(() => Promise.resolve(ok));
    render(
      <EntityForm
        kind="author"
        mode="create"
        siteId="exemplo-a"
        defaultValues={{ slug: '', name: '' }}
        media={[{ id: 2, label: 'Mídia 2 (400×400)' }]}
        action={action}
      />,
    );

    await user.type(screen.getByLabelText('Nome'), 'Carla Dias');
    await user.type(screen.getByLabelText('Slug'), 'carla-dias');
    await user.selectOptions(screen.getByLabelText('Foto'), 'Mídia 2 (400×400)');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0]).toEqual({
      slug: 'carla-dias',
      name: 'Carla Dias',
      avatarMediaId: 2,
    });
    expect(router.push).toHaveBeenCalledWith('/sites/exemplo-a/autores');
  });

  it('taxonomia: o slug repetido volta no campo e não sai da tela', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() =>
      Promise.resolve<EntityFormResult>({
        ok: false,
        message: 'Não foi possível salvar.',
        issues: [{ path: ['slug'], message: 'Já existe uma taxonomia com o slug guias' }],
      }),
    );
    render(
      <EntityForm
        kind="taxonomy"
        mode="create"
        siteId="exemplo-a"
        defaultValues={{ kind: 'category', slug: 'guias', name: 'Guias' }}
        action={action}
      />,
    );

    expect(screen.getByLabelText<HTMLSelectElement>('Tipo').value).toBe('category');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    const slug = screen.getByLabelText('Slug');
    await waitFor(() => expect(slug.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Já existe uma taxonomia com o slug guias')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('menu: edita o rótulo de um item', async () => {
    const user = userEvent.setup();
    const action = vi.fn<(value: unknown) => Promise<EntityFormResult>>(() => Promise.resolve(ok));
    render(
      <EntityForm
        kind="menu"
        mode="edit"
        siteId="exemplo-a"
        defaultValues={{ key: 'principal', items: [{ label: 'Início', href: '/' }] }}
        action={action}
      />,
    );

    const label = screen.getByLabelText('Rótulo');
    await user.clear(label);
    await user.type(label, 'Começo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0]).toEqual({
      key: 'principal',
      items: [{ label: 'Começo', href: '/' }],
    });
    expect(router.push).toHaveBeenCalledWith('/sites/exemplo-a/menus');
  });
});
