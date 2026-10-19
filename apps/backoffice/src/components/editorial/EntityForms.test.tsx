// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp.ts';
import { EntityForm, InstitutionalTextsForm, type EntityFormResult } from './EntityForms.tsx';

// Formulários de entidades (#46): rótulos por tipo, recusa no campo e volta para a lista.

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

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
  vi.clearAllMocks();
});

const ok: EntityFormResult = { ok: true, message: 'Salvo.' };
const avatar = {
  id: 2,
  width: 400,
  height: 400,
  sources: [],
  src: 'https://media.exemplo-a.test/2.webp',
};

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
        media={{
          load: (page) => Promise.resolve({ items: [avatar], total: 1, page, pageSize: 24 }),
          byIds: () => Promise.resolve([avatar]),
        }}
        action={action}
      />,
      { container: app },
    );

    await user.type(screen.getByLabelText('Nome'), 'Carla Dias');
    await user.type(screen.getByLabelText('Slug'), 'carla-dias');
    // A foto pela grade de miniaturas (#182).
    const photo = screen.getByRole('group', { name: 'Foto' });
    await user.click(within(photo).getByRole('button', { name: 'Escolher imagem' }));
    const picker = screen.getByRole('dialog', { name: 'Escolher imagem' });
    await user.click(await within(picker).findByRole('button', { name: 'Mídia 2 · 400×400' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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

  it('criar: "Criando…" com o botão desabilitado até a resposta', async () => {
    const user = userEvent.setup();
    let finish: (result: EntityFormResult) => void = () => undefined;
    const action = vi.fn(
      () =>
        new Promise<EntityFormResult>((resolve) => {
          finish = resolve;
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

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('button', { name: 'Criando…' })).toHaveProperty(
      'disabled',
      true,
    );
    finish(ok);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sites/exemplo-a/taxonomias'));
  });

  it('textos institucionais: a confirmação aparece ao lado do botão', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() =>
      Promise.resolve<EntityFormResult>({ ok: true, message: 'Textos salvos.' }),
    );
    render(<InstitutionalTextsForm defaultValues={{}} action={action} />);

    await user.click(screen.getByRole('button', { name: 'Salvar textos' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Textos salvos.'));
    expect(screen.getByRole('status').className).toContain('text-success');
    expect(router.refresh).toHaveBeenCalled();
  });
});
