// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';
import type { InfraPlanView } from '@/domain/infra/plan.ts';

import {
  CreateInfraDialog,
  INFRA_ALREADY_CONFIRMED,
  INFRA_SUMMARY_UNREADABLE,
  TITLE,
  infraPlanState,
  useCreateInfra,
  type CreateInfraState,
} from './CreateInfraDialog.tsx';

// Diálogo de "Criar infraestrutura" (#825): preparando, resumo por etapa e erro ao preparar;
// "Confirmar" só com o resumo. O controle (`useCreateInfra`) pede o plano e o lê até o resumo.

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

const zone = { address: 'module.site.cloudflare_zone.site', type: 'cloudflare_zone' };
const SUMMARY: InfraPlanSummary = {
  formatVersion: 1,
  steps: {
    endereco: [{ ...zone, action: 'create' }],
    dns: [
      { address: 'a', type: 'cloudflare_dns_record', action: 'create' },
      { address: 'b', type: 'cloudflare_dns_record', action: 'create' },
    ],
    email: [],
    regras: [{ address: 'r', type: 'cloudflare_ruleset', action: 'update' }],
    imagens: [],
  },
};

describe('estado do diálogo a partir do plano', () => {
  it.each<[InfraPlanView, CreateInfraState]>([
    [{ status: 'planejando' }, { kind: 'preparando' }],
    [
      { status: 'aguardando_confirmacao', summary: SUMMARY },
      { kind: 'resumo', summary: SUMMARY },
    ],
    [
      { status: 'aguardando_confirmacao', summary: null },
      { kind: 'erro', message: INFRA_SUMMARY_UNREADABLE },
    ],
    [
      { status: 'falhou', message: 'token inválido' },
      { kind: 'erro', message: 'token inválido' },
    ],
    [{ status: 'aplicando' }, { kind: 'erro', message: INFRA_ALREADY_CONFIRMED }],
  ])('%j → %j', (view, state) => {
    expect(infraPlanState(view)).toEqual(state);
  });
});

function dialog(state: CreateInfraState, onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(<CreateInfraDialog isOpen state={state} onConfirm={onConfirm} onCancel={onCancel} />, {
    container: app,
  });
  return screen.getByRole('alertdialog', { name: TITLE });
}

const confirmButton = (box: HTMLElement) =>
  within(box).getByRole<HTMLButtonElement>('button', { name: 'Confirmar' });

describe('CreateInfraDialog', () => {
  it('preparando: anuncia o preparo e não deixa confirmar', () => {
    const box = dialog({ kind: 'preparando' });

    expect(within(box).getByRole('status').textContent).toBe(
      'Preparando o resumo do que será criado…',
    );
    expect(confirmButton(box).disabled).toBe(true);
  });

  it('resumo: as cinco etapas na ordem, com o que muda em cada uma', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const box = dialog({ kind: 'resumo', summary: SUMMARY }, onConfirm);

    const items = within(within(box).getByRole('list', { name: 'Resumo por etapa' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      'Endereço1 a criar',
      'Registros de DNS2 a criar',
      'E-mailNada muda',
      'Regras1 a alterar',
      'Armazenamento de imagensNada muda',
    ]);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(confirmButton(box));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('erro: a mensagem no Alert e "Confirmar" desativado', () => {
    const box = dialog({ kind: 'erro', message: 'token inválido' });

    expect(within(box).getByRole('alert').textContent).toBe('token inválido');
    expect(confirmButton(box).disabled).toBe(true);
  });

  it('"Cancelar" chama só o onCancel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const box = dialog({ kind: 'resumo', summary: SUMMARY }, onConfirm, onCancel);

    await user.click(within(box).getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

type Request = Parameters<typeof useCreateInfra>[0]['request'];
type Read = Parameters<typeof useCreateInfra>[0]['read'];

/** O hook com um botão para cada entrada, e o estado em texto. */
function Harness({ request, read, reopen }: { request: Request; read: Read; reopen?: number }) {
  const infra = useCreateInfra({ request, read, pollMs: 10 });
  return (
    <>
      <button
        type="button"
        onClick={reopen === undefined ? infra.start : () => infra.reopen(reopen)}
      >
        abrir
      </button>
      <output>{infra.isOpen ? `${infra.state.kind}:${infra.runId ?? '-'}` : 'fechado'}</output>
    </>
  );
}

const output = () => screen.getByRole('status').textContent;

describe('useCreateInfra', () => {
  it('pede o plano uma vez e lê até o resumo', async () => {
    const user = userEvent.setup();
    const request = vi.fn<Request>().mockResolvedValue({ ok: true, runId: 7 });
    const read = vi
      .fn<Read>()
      .mockResolvedValueOnce({ status: 'planejando' })
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ status: 'aguardando_confirmacao', summary: SUMMARY });
    render(<Harness request={request} read={read} />);

    await user.click(screen.getByRole('button', { name: 'abrir' }));

    await waitFor(() => expect(output()).toBe('resumo:7'));
    expect(request).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(7);
    const calls = read.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(read).toHaveBeenCalledTimes(calls);
  });

  it('a recusa do pedido vira erro, sem ler', async () => {
    const user = userEvent.setup();
    const read = vi.fn<Read>();
    render(
      <Harness
        request={() => Promise.resolve({ ok: false, message: 'execução aberta' })}
        read={read}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'abrir' }));

    await waitFor(() => expect(output()).toBe('erro:-'));
    expect(read).not.toHaveBeenCalled();
  });

  it('o pedido rejeitado vira erro', async () => {
    const user = userEvent.setup();
    render(<Harness request={() => Promise.reject(new Error('rede'))} read={vi.fn<Read>()} />);

    await user.click(screen.getByRole('button', { name: 'abrir' }));

    await waitFor(() => expect(output()).toBe('erro:-'));
  });

  it('reabrir lê a execução aberta sem pedir outro plano', async () => {
    const user = userEvent.setup();
    const request = vi.fn<Request>();
    const read = vi
      .fn<Read>()
      .mockResolvedValue({ status: 'aguardando_confirmacao', summary: SUMMARY });
    render(<Harness request={request} read={read} reopen={4} />);

    await user.click(screen.getByRole('button', { name: 'abrir' }));

    await waitFor(() => expect(output()).toBe('resumo:4'));
    expect(read).toHaveBeenCalledWith(4);
    expect(request).not.toHaveBeenCalled();
  });
});
