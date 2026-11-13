// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';

import { infraPlanState, type CreateInfraState } from './CreateInfraDialog.tsx';
import {
  INFRA_REAPPLY_ALREADY_CONFIRMED,
  REAPPLY_TITLE,
  ReapplyInfraDialog,
} from './ReapplyInfraDialog.tsx';

// Diálogo de "Reaplicar infraestrutura" (workspace#98): preparando, resumo por etapa e erro ao
// preparar; "Confirmar" só com o resumo, "Cancelar" só fecha.

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

const SUMMARY: InfraPlanSummary = {
  formatVersion: 1,
  steps: {
    endereco: [],
    dns: [{ address: 'a', type: 'cloudflare_dns_record', action: 'update' }],
    email: [],
    regras: [{ address: 'r', type: 'cloudflare_ruleset', action: 'replace' }],
    imagens: [],
  },
};

function dialog(state: CreateInfraState, onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(<ReapplyInfraDialog isOpen state={state} onConfirm={onConfirm} onCancel={onCancel} />, {
    container: app,
  });
  return screen.getByRole('alertdialog', { name: REAPPLY_TITLE });
}

const confirmButton = (box: HTMLElement) =>
  within(box).getByRole<HTMLButtonElement>('button', { name: 'Confirmar' });

describe('ReapplyInfraDialog', () => {
  it('preparando: anuncia o preparo e não deixa confirmar', () => {
    const box = dialog({ kind: 'preparando' });

    expect(within(box).getByRole('status').textContent).toBe(
      'Preparando o resumo do que será reaplicado…',
    );
    expect(confirmButton(box).disabled).toBe(true);
  });

  it('resumo: o que muda em cada etapa; só "Confirmar" confirma', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const box = dialog({ kind: 'resumo', summary: SUMMARY }, onConfirm);

    const items = within(within(box).getByRole('list', { name: 'Resumo por etapa' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      'EndereçoNada muda',
      'Registros de DNS1 a alterar',
      'E-mailNada muda',
      'Regras1 a recriar',
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

  it('já confirmada, o estado diz a mensagem da reaplicação', () => {
    expect(infraPlanState({ status: 'aplicando' }, INFRA_REAPPLY_ALREADY_CONFIRMED)).toEqual({
      kind: 'erro',
      message: INFRA_REAPPLY_ALREADY_CONFIRMED,
    });
  });
});
