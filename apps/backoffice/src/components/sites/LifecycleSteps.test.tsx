// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { TITLE } from './CreateInfraDialog.tsx';
import { LifecycleSteps } from './LifecycleSteps.tsx';
import { REAPPLY_TITLE } from './ReapplyInfraDialog.tsx';
import { REMOVE_TITLE } from './RemoveInfraDialog.tsx';
import {
  LifecycleAction,
  LifecycleActionScope,
  type CreateInfraActions,
  type ReapplyInfraActions,
  type RemoveInfraActions,
} from './SiteActions.tsx';
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

describe('Remover infraestrutura (workspace#97)', () => {
  const DOMAIN = 'exemplo-a.com.br';
  const summary = {
    formatVersion: 1 as const,
    steps: {
      endereco: [{ address: 'z', type: 'cloudflare_zone', action: 'delete' as const }],
      dns: [],
      email: [],
      regras: [],
      imagens: [{ address: 'b', type: 'cloudflare_r2_bucket', action: 'delete' as const }],
    },
  };
  const removeActions = (overrides: Partial<RemoveInfraActions> = {}): RemoveInfraActions => ({
    domain: DOMAIN,
    activePages: 12,
    active: false,
    open: null,
    request: vi.fn<RemoveInfraActions['request']>().mockResolvedValue({ ok: true, runId: 9 }),
    read: vi
      .fn<RemoveInfraActions['read']>()
      .mockResolvedValue({ status: 'aguardando_confirmacao', summary }),
    confirm: vi.fn<RemoveInfraActions['confirm']>(ok),
    ...overrides,
  });
  const withRemove = (remove?: RemoveInfraActions, lifecycle: Lifecycle = 'publicado') => (
    <LifecycleActionScope>
      <LifecycleAction lifecycle={lifecycle} check={ok} undo={ok} remove={remove} />
    </LifecycleActionScope>
  );
  const REMOVE = 'Remover infraestrutura';

  async function openSummary(remove: RemoveInfraActions) {
    const user = userEvent.setup();
    render(withRemove(remove), { container: app });
    await user.click(screen.getByRole('button', { name: REMOVE }));
    const dialog = screen.getByRole('alertdialog', { name: REMOVE_TITLE });
    await waitFor(() =>
      expect(within(dialog).queryByRole('list', { name: 'O que será apagado' })).not.toBeNull(),
    );
    return { user, dialog };
  }

  it('sem as actions de remoção (sem site.destroy na página), não aparece', () => {
    render(withRemove(undefined));

    expect(screen.queryByRole('button', { name: REMOVE })).toBeNull();
  });

  it.each(['infra_aplicada', 'zona_ativa', 'publicado'] as const)(
    'em %s, com o site pausado, aparece habilitada',
    (lifecycle) => {
      render(withRemove(removeActions(), lifecycle));

      expect(screen.getByRole('button', { name: REMOVE }).hasAttribute('disabled')).toBe(false);
    },
  );

  it('com a última remoção em falha, vira "Tentar de novo" e pede um plano novo', async () => {
    const user = userEvent.setup();
    const remove = removeActions({ retry: true });
    render(withRemove(remove), { container: app });

    expect(screen.queryByRole('button', { name: REMOVE })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Tentar de novo a remoção da infraestrutura' }),
    );

    const dialog = screen.getByRole('alertdialog', { name: REMOVE_TITLE });
    await waitFor(() =>
      expect(within(dialog).queryByRole('list', { name: 'O que será apagado' })).not.toBeNull(),
    );
    expect(remove.request).toHaveBeenCalledTimes(1);
    await user.type(within(dialog).getByRole('textbox'), DOMAIN);
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));
    expect(remove.confirm).toHaveBeenCalledWith(9, DOMAIN);
  });

  it('num site cadastrado, não aparece', () => {
    render(withRemove(removeActions(), 'cadastrado'));

    expect(screen.queryByRole('button', { name: REMOVE })).toBeNull();
  });

  it('com o site ativo, aparece desabilitada com o aviso de pausar antes', () => {
    render(withRemove(removeActions({ active: true })));

    const button = screen.getByRole('button', { name: REMOVE });
    expect(button.hasAttribute('disabled')).toBe(true);
    const hint = screen.getByText('Para remover a infraestrutura, pause o site antes.');
    expect(button.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it.each([
    { id: 4, kind: 'criar' as const, status: 'aguardando_confirmacao' as const },
    { id: 4, kind: 'remover' as const, status: 'aplicando' as const },
  ])('com outra execução aberta ($kind, $status), não aparece', (open) => {
    render(withRemove(removeActions({ open })));

    expect(screen.queryByRole('button', { name: /Remover|remoção/ })).toBeNull();
  });

  it.each(['planejando', 'aguardando_confirmacao'] as const)(
    'com a remoção %s, vira "Revisar e confirmar a remoção" e reabre o diálogo no estado salvo',
    async (status) => {
      const user = userEvent.setup();
      const remove = removeActions({ open: { id: 5, kind: 'remover', status } });
      render(withRemove(remove), { container: app });

      expect(screen.queryByRole('button', { name: REMOVE })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Revisar e confirmar a remoção' }));

      screen.getByRole('alertdialog', { name: REMOVE_TITLE });
      await waitFor(() => expect(remove.read).toHaveBeenCalledWith(5));
      expect(remove.request).not.toHaveBeenCalled();
    },
  );

  it('lista o que será apagado e o que fica', async () => {
    const { dialog } = await openSummary(removeActions());

    const removed = within(dialog).getByRole('list', { name: 'O que será apagado' });
    expect(
      within(removed)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Páginas publicadas12 a remover',
      'Endereço1 a remover',
      'Registros de DNSNada muda',
      'E-mailNada muda',
      'RegrasNada muda',
      'Armazenamento de imagens1 a remover',
    ]);
    const kept = within(dialog).getByRole('list', { name: 'O que fica' });
    expect(within(kept).getAllByRole('listitem')).toHaveLength(3);
  });

  it('"Remover" só se habilita com o domínio exato e envia o texto digitado', async () => {
    const remove = removeActions();
    const { user, dialog } = await openSummary(remove);
    const confirm = within(dialog).getByRole('button', { name: 'Remover' });
    const field = within(dialog).getByRole('textbox', { name: `Digite ${DOMAIN} para confirmar` });

    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.type(field, 'outro.com.br');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByText('O texto não é o domínio do site.')).not.toBeNull();
    await user.click(confirm);
    expect(remove.confirm).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, DOMAIN);
    expect(confirm.hasAttribute('disabled')).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(remove.confirm).toHaveBeenCalledWith(9, DOMAIN));
    expect(remove.confirm).toHaveBeenCalledTimes(1);
  });

  it('"Cancelar" fecha o diálogo sem confirmar', async () => {
    const remove = removeActions();
    const { user, dialog } = await openSummary(remove);

    await user.type(within(dialog).getByRole('textbox'), DOMAIN);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(remove.confirm).not.toHaveBeenCalled();
  });

  it('a recusa da confirmação vai ao Alert do escopo', async () => {
    const message = 'O domínio digitado não é o do site; a remoção não foi confirmada';
    const remove = removeActions({ confirm: () => Promise.resolve({ ok: false, message }) });
    const { user, dialog } = await openSummary(remove);

    await user.type(within(dialog).getByRole('textbox'), DOMAIN);
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message));
  });
});

describe('Reaplicar infraestrutura (workspace#98)', () => {
  const summary = {
    formatVersion: 1 as const,
    steps: {
      endereco: [],
      dns: [{ address: 'd', type: 'cloudflare_dns_record', action: 'update' as const }],
      email: [],
      regras: [],
      imagens: [],
    },
  };
  const reapplyActions = (overrides: Partial<ReapplyInfraActions> = {}): ReapplyInfraActions => ({
    open: null,
    request: vi.fn<ReapplyInfraActions['request']>().mockResolvedValue({ ok: true, runId: 12 }),
    read: vi
      .fn<ReapplyInfraActions['read']>()
      .mockResolvedValue({ status: 'aguardando_confirmacao', summary }),
    confirm: vi.fn<ReapplyInfraActions['confirm']>(ok),
    ...overrides,
  });
  const withReapply = (reapply?: ReapplyInfraActions, lifecycle: Lifecycle = 'publicado') => (
    <LifecycleActionScope>
      <LifecycleAction lifecycle={lifecycle} check={ok} undo={ok} reapply={reapply} />
    </LifecycleActionScope>
  );
  const REAPPLY = 'Reaplicar infraestrutura';
  const REVIEW = 'Revisar e confirmar a reaplicação';

  async function openSummary(reapply: ReapplyInfraActions) {
    const user = userEvent.setup();
    render(withReapply(reapply), { container: app });
    await user.click(screen.getByRole('button', { name: REAPPLY }));
    const dialog = screen.getByRole('alertdialog', { name: REAPPLY_TITLE });
    await waitFor(() =>
      expect(within(dialog).queryByRole('list', { name: 'Resumo por etapa' })).not.toBeNull(),
    );
    return { user, dialog };
  }

  it('sem as actions de reaplicação (sem site.configure na página), não aparece', () => {
    render(withReapply(undefined));

    expect(screen.queryByRole('button', { name: /Reaplicar|reaplicação/ })).toBeNull();
  });

  it.each(['infra_aplicada', 'zona_ativa', 'publicado'] as const)(
    'em %s, sem execução aberta, aparece',
    (lifecycle) => {
      render(withReapply(reapplyActions(), lifecycle));

      expect(screen.getByRole('button', { name: REAPPLY })).not.toBeNull();
    },
  );

  it('num site cadastrado, não aparece', () => {
    render(withReapply(reapplyActions(), 'cadastrado'));

    expect(screen.queryByRole('button', { name: /Reaplicar|reaplicação/ })).toBeNull();
  });

  it.each([
    { id: 4, kind: 'criar' as const, status: 'aguardando_confirmacao' as const, inBatch: false },
    { id: 4, kind: 'remover' as const, status: 'planejando' as const, inBatch: false },
    { id: 4, kind: 'reaplicar' as const, status: 'aplicando' as const, inBatch: false },
    { id: 4, kind: 'reaplicar' as const, status: 'aguardando_confirmacao' as const, inBatch: true },
  ])('com outra execução aberta ($kind, $status, lote: $inBatch), não aparece', (open) => {
    render(withReapply(reapplyActions({ open })));

    expect(screen.queryByRole('button', { name: /Reaplicar|reaplicação/ })).toBeNull();
  });

  it.each(['planejando', 'aguardando_confirmacao'] as const)(
    'com a reaplicação %s pedida no site, vira "Revisar e confirmar a reaplicação" e reabre o diálogo',
    async (status) => {
      const user = userEvent.setup();
      const reapply = reapplyActions({
        open: { id: 6, kind: 'reaplicar', status, inBatch: false },
      });
      render(withReapply(reapply), { container: app });

      expect(screen.queryByRole('button', { name: REAPPLY })).toBeNull();
      await user.click(screen.getByRole('button', { name: REVIEW }));

      screen.getByRole('alertdialog', { name: REAPPLY_TITLE });
      await waitFor(() => expect(reapply.read).toHaveBeenCalledWith(6));
      expect(reapply.request).not.toHaveBeenCalled();
    },
  );

  it('com a última reaplicação em falha, vira "Tentar de novo" e pede um plano novo', async () => {
    const user = userEvent.setup();
    const reapply = reapplyActions({ retry: true });
    render(withReapply(reapply), { container: app });

    await user.click(
      screen.getByRole('button', { name: 'Tentar de novo a reaplicação da infraestrutura' }),
    );

    await waitFor(() => expect(reapply.request).toHaveBeenCalledTimes(1));
  });

  it('nada é confirmado antes de "Confirmar"; "Confirmar" confirma a execução pedida', async () => {
    const reapply = reapplyActions();
    const { user, dialog } = await openSummary(reapply);

    expect(reapply.confirm).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(reapply.confirm).toHaveBeenCalledWith(12));
    expect(reapply.confirm).toHaveBeenCalledTimes(1);
  });

  it('"Cancelar" fecha o diálogo sem confirmar', async () => {
    const reapply = reapplyActions();
    const { user, dialog } = await openSummary(reapply);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(reapply.confirm).not.toHaveBeenCalled();
  });

  it('a recusa da confirmação vai ao Alert do escopo', async () => {
    const message = 'A execução 12 não está em aguardando_confirmacao';
    const reapply = reapplyActions({ confirm: () => Promise.resolve({ ok: false, message }) });
    const { user, dialog } = await openSummary(reapply);

    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message));
  });
});
