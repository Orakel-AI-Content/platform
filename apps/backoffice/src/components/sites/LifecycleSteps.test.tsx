// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { TITLE } from './CreateInfraDialog.tsx';
import { LifecycleSteps } from './LifecycleSteps.tsx';
import { LifecycleAction, LifecycleActionScope, type CreateInfraActions } from './SiteActions.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

// Conteúdo da etapa "Infra e zona" do painel da aba "Publicação" (#647): o ciclo de vida em
// texto, "Conferir agora" (workspace#85) e "Desmarcar" com confirmação (#714), com o erro no
// Alert do escopo. O polling da conferência está em `SitePublicationTab.test.tsx`.

let app: HTMLElement;

beforeAll(() => {
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
afterEach(async () => {
  cleanup();
  await waitFor(() => expect(document.querySelector('.dialog-portal')).toBeNull());
  app.remove();
});

type Lifecycle = SiteSummary['lifecycle'];

const ok = (): Promise<ActionResult> => Promise.resolve({ ok: true, message: '' });

const withAction = (lifecycle: Lifecycle, check = ok, undo = ok) => (
  <LifecycleActionScope>
    <LifecycleSteps
      current={lifecycle}
      action={<LifecycleAction lifecycle={lifecycle} check={check} undo={undo} />}
    />
  </LifecycleActionScope>
);

const buttons = () => screen.getAllByRole('button').map((button) => button.textContent);

describe('etapa Infra e zona', () => {
  it.each([
    ['cadastrado', 'Infra e zona pendentes'],
    ['infra_aplicada', 'Infra aplicada, zona pendente'],
    ['zona_ativa', 'Infra aplicada e zona ativa'],
    ['publicado', 'Infra aplicada e zona ativa'],
  ] as const)('em %s mostra "%s"', (lifecycle, text) => {
    render(<LifecycleSteps current={lifecycle} />);

    expect(screen.getByText(text)).not.toBeNull();
  });

  it.each([
    ['cadastrado', ['Conferir agora']],
    ['infra_aplicada', ['Conferir agora', 'Desmarcar infra aplicada']],
    ['zona_ativa', ['Desmarcar zona ativa']],
  ] as const)('em %s mostra as ações %j', (lifecycle, names) => {
    render(withAction(lifecycle));

    expect(buttons()).toEqual(names);
  });

  it('em publicado nenhuma ação aparece', () => {
    render(withAction('publicado'));

    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(['cadastrado', 'infra_aplicada', 'zona_ativa', 'publicado'] as const)(
    'em %s, nenhum "Marcar…" aparece',
    (lifecycle) => {
      render(withAction(lifecycle));

      expect(document.body.textContent).not.toMatch(/Marcar (infra aplicada|zona ativa)/);
    },
  );

  it('"Conferir agora" pede a conferência uma vez', async () => {
    const user = userEvent.setup();
    const check = vi.fn(ok);
    render(withAction('cadastrado', check));

    await user.click(screen.getByRole('button', { name: 'Conferir agora' }));

    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
  });

  it('a recusa de "Conferir agora" vai ao Alert e continua lá quando a revalidação troca a etapa', async () => {
    const user = userEvent.setup();
    const check = (): Promise<ActionResult> =>
      Promise.resolve({ ok: false, message: 'Sem permissão para site.configure' });
    const { rerender } = render(withAction('cadastrado', check));
    const region = screen.getByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Conferir agora' }));
    await waitFor(() => expect(region.textContent).toBe('Sem permissão para site.configure'));

    rerender(withAction('infra_aplicada', check));
    expect(screen.getByRole('alert').textContent).toBe('Sem permissão para site.configure');
    expect(screen.getByRole('button', { name: 'Conferir agora' })).not.toBeNull();
  });
});

describe('Desmarcar', () => {
  it.each([
    ['zona_ativa', 'Desmarcar zona ativa?', 'Infra aplicada, zona pendente'],
    ['infra_aplicada', 'Desmarcar infra aplicada?', 'Infra e zona pendentes'],
  ] as const)('em %s, só desmarca depois de confirmar', async (lifecycle, title, back) => {
    const user = userEvent.setup();
    const undo = vi.fn(ok);
    render(withAction(lifecycle, ok, undo), { container: app });

    await user.click(screen.getByRole('button', { name: /^Desmarcar/ }));
    const dialog = screen.getByRole('alertdialog', { name: title });
    expect(dialog.textContent).toContain(`A etapa volta para "${back}".`);
    expect(dialog.textContent).toContain('a próxima conferência automática marca a etapa de novo');
    expect(undo).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Desmarcar' }));
    await waitFor(() => expect(undo).toHaveBeenCalledWith(lifecycle));
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('cancelar fecha o diálogo sem chamar a action', async () => {
    const user = userEvent.setup();
    const undo = vi.fn(ok);
    render(withAction('zona_ativa', ok, undo), { container: app });

    await user.click(screen.getByRole('button', { name: 'Desmarcar zona ativa' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(undo).not.toHaveBeenCalled();
  });

  it('a recusa vai ao Alert do escopo', async () => {
    const user = userEvent.setup();
    const undo = (): Promise<ActionResult> =>
      Promise.resolve({
        ok: false,
        message: 'zona_ativa só pode ser desmarcada com o site em zona_ativa',
      });
    render(withAction('zona_ativa', ok, undo), { container: app });
    const region = screen.getByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Desmarcar zona ativa' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desmarcar' }),
    );

    await waitFor(() =>
      expect(region.textContent).toBe('zona_ativa só pode ser desmarcada com o site em zona_ativa'),
    );
  });
});

describe('Criar infraestrutura (#825)', () => {
  const summary = {
    formatVersion: 1 as const,
    steps: { endereco: [], dns: [], email: [], regras: [], imagens: [] },
  };
  const infraActions = (overrides: Partial<CreateInfraActions> = {}): CreateInfraActions => ({
    open: null,
    request: vi.fn<CreateInfraActions['request']>().mockResolvedValue({ ok: true, runId: 7 }),
    read: vi
      .fn<CreateInfraActions['read']>()
      .mockResolvedValue({ status: 'aguardando_confirmacao', summary }),
    confirm: vi.fn(ok),
    ...overrides,
  });
  const withInfra = (infra: CreateInfraActions, lifecycle: Lifecycle = 'cadastrado') => (
    <LifecycleActionScope>
      <LifecycleAction lifecycle={lifecycle} check={ok} undo={ok} infra={infra} />
    </LifecycleActionScope>
  );
  const REVIEW = 'Revisar e confirmar a criação da infraestrutura';

  it('num site cadastrado sem execução aberta, aparece ao lado de "Conferir agora"', () => {
    render(withInfra(infraActions()));

    expect(buttons()).toEqual(['Criar infraestrutura', 'Conferir agora']);
  });

  it('sem as actions de infra (sem site.configure na página), não aparece', () => {
    render(withAction('cadastrado'));

    expect(screen.queryByRole('button', { name: 'Criar infraestrutura' })).toBeNull();
  });

  it.each(['infra_aplicada', 'zona_ativa', 'publicado'] as const)(
    'em %s, não aparece',
    (lifecycle) => {
      render(withInfra(infraActions(), lifecycle));

      expect(screen.queryByRole('button', { name: /Criar infraestrutura|Revisar/ })).toBeNull();
    },
  );

  it.each(['planejando', 'aguardando_confirmacao'] as const)(
    'com execução %s, vira "Revisar e confirmar" e reabre o diálogo no estado salvo',
    async (status) => {
      const user = userEvent.setup();
      const infra = infraActions({ open: { id: 4, status } });
      render(withInfra(infra), { container: app });

      expect(screen.queryByRole('button', { name: 'Criar infraestrutura' })).toBeNull();
      await user.click(screen.getByRole('button', { name: REVIEW }));

      const dialog = screen.getByRole('alertdialog', { name: TITLE });
      await waitFor(() => expect(within(dialog).queryByRole('list')).not.toBeNull());
      expect(infra.read).toHaveBeenCalledWith(4);
      expect(infra.request).not.toHaveBeenCalled();
    },
  );

  it('com a última criação em falha, vira "Tentar de novo" e pede um plano novo (#826)', async () => {
    const user = userEvent.setup();
    const infra = infraActions({ retry: true });
    render(withInfra(infra), { container: app });

    expect(screen.queryByRole('button', { name: 'Criar infraestrutura' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Tentar de novo a criação da infraestrutura' }),
    );

    const dialog = screen.getByRole('alertdialog', { name: TITLE });
    await waitFor(() => expect(within(dialog).queryByRole('list')).not.toBeNull());
    expect(infra.request).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(infra.confirm).toHaveBeenCalledWith(7);
  });

  it('com execução aplicando, nenhuma das duas aparece', () => {
    render(withInfra(infraActions({ open: { id: 4, status: 'aplicando' } })));

    expect(buttons()).toEqual(['Conferir agora']);
  });

  it('pede o plano ao abrir e só confirma no "Confirmar"', async () => {
    const user = userEvent.setup();
    const infra = infraActions();
    render(withInfra(infra), { container: app });

    await user.click(screen.getByRole('button', { name: 'Criar infraestrutura' }));
    const dialog = screen.getByRole('alertdialog', { name: TITLE });
    await waitFor(() => expect(within(dialog).queryByRole('list')).not.toBeNull());
    expect(infra.request).toHaveBeenCalledTimes(1);
    expect(infra.confirm).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(infra.confirm).toHaveBeenCalledWith(7));
    expect(infra.confirm).toHaveBeenCalledTimes(1);
  });

  it('"Cancelar" fecha o diálogo sem confirmar', async () => {
    const user = userEvent.setup();
    const infra = infraActions();
    render(withInfra(infra), { container: app });

    await user.click(screen.getByRole('button', { name: 'Criar infraestrutura' }));
    const dialog = screen.getByRole('alertdialog', { name: TITLE });
    await waitFor(() => expect(within(dialog).queryByRole('list')).not.toBeNull());
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(infra.confirm).not.toHaveBeenCalled();
  });

  it('a recusa da confirmação vai ao Alert do escopo', async () => {
    const user = userEvent.setup();
    const message = 'A execução 7 está em aplicando; a transição exige aguardando_confirmacao';
    const infra = infraActions({
      confirm: () => Promise.resolve({ ok: false, message }),
    });
    render(withInfra(infra), { container: app });

    await user.click(screen.getByRole('button', { name: 'Criar infraestrutura' }));
    const dialog = screen.getByRole('alertdialog', { name: TITLE });
    await waitFor(() => expect(within(dialog).queryByRole('list')).not.toBeNull());
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message));
  });
});
