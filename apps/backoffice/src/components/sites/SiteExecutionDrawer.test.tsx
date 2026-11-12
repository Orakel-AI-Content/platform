// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { type FailedExecution, SiteExecutionDrawer } from './SiteExecutionDrawer.tsx';

// Detalhe da falha na aba "Histórico" (#637): quando, quem pediu, etapa, mensagem e fim do log;
// "—" na etapa do rollback e aviso sem log. Teclado e foco no navegador, em
// `SiteBuildsTable.browser.test.tsx`.

const FAILED: FailedExecution = {
  type: 'execucao',
  id: 7,
  kind: 'build',
  status: 'failed',
  requestedBy: 'ana@orakel.local',
  cancelRequestedBy: null,
  at: new Date('2026-10-11T12:00:00Z'),
  release: '1.3.0',
  versionId: null,
  failure: {
    stage: 'render',
    kind: 'permanent',
    message: 'astro build saiu com código 1',
    logTail: 'error: página /a quebrou\nexit 1',
  },
};

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
  await waitFor(() => expect(document.querySelector('.drawer-portal')).toBeNull());
  app.remove();
});

function fields(dialog: HTMLElement) {
  return Object.fromEntries(
    within(dialog)
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
  );
}

describe('SiteExecutionDrawer', () => {
  it('mostra quando, quem pediu, a etapa, a mensagem e o fim do log da falha', () => {
    render(
      <SiteExecutionDrawer execution={FAILED} timeZone="America/Sao_Paulo" onClose={vi.fn()} />,
      {
        container: app,
      },
    );

    const dialog = screen.getByRole('dialog', { name: 'Falha da publicação' });
    expect(fields(dialog)).toEqual({
      Quando: '11/10/2026, 09:00 BRT',
      'Quem pediu': 'ana@orakel.local',
      Etapa: 'Renderização',
      Mensagem: 'astro build saiu com código 1',
      'Fim do log': 'error: página /a quebrou\nexit 1',
    });
    expect(within(dialog).getByLabelText('Fim do log').tagName).toBe('PRE');
  });

  it('no rollback sem log, etapa "—" e o aviso no lugar do log', () => {
    render(
      <SiteExecutionDrawer
        execution={{
          ...FAILED,
          kind: 'rollback',
          failure: { stage: null, kind: null, message: null, logTail: null },
        }}
        timeZone="America/Sao_Paulo"
        onClose={vi.fn()}
      />,
      { container: app },
    );

    const dialog = screen.getByRole('dialog', { name: 'Falha da reversão' });
    expect(fields(dialog)).toMatchObject({
      Etapa: '—',
      Mensagem: '—',
      'Fim do log': 'Sem log gravado.',
    });
  });

  it('fechado sem execução; o botão de fechar chama onClose', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <SiteExecutionDrawer execution={null} timeZone="America/Sao_Paulo" onClose={onClose} />,
      { container: app },
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <SiteExecutionDrawer execution={FAILED} timeZone="America/Sao_Paulo" onClose={onClose} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Falha da publicação' });
    await userEvent.click(within(dialog).getByRole('button', { name: /fechar/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
