// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { OpenExecution, SiteActivity } from '@/domain/builds/builds.ts';
import { toast, ToastProvider } from '@/components/ui/toast';
import { CONTROL_SIZES } from '@/components/ui/utils/constants';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import {
  SiteOperationButton,
  SiteOperationsAlert,
  SiteOperationsScope,
} from './SiteOperations.tsx';
import { type PublicationSite, SitePublicationSteps } from './SitePublicationSteps.tsx';

// Ações de operação nas etapas da aba "Publicação" (#648; antes no cabeçalho, #595):
// "Reconstruir na release" na Versão, "Publicar agora" na Build, "Escolher outra versão" na No ar
// e, na linha Site, "Pausar" com motivo (#650) ou, pausado, "Retomar", cada uma com a confirmação de hoje (#327, #514, #515); o
// sucesso vai ao toast e a recusa de qualquer uma ao `SiteOperationsAlert`, abaixo do painel.
// "Cancelar" fica ao lado de "Publicar agora" com publicação na fila e no lugar dele em
// andamento; "Desfazer última publicação" fica ao lado de "Escolher outra versão" (#649). Foco no navegador, em
// `SiteOperations.browser.test.tsx`.

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
let app: HTMLElement;
beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});
afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
  app.remove();
});

const ok = (message: string) =>
  vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: true, message }));
const refused = (message: string) =>
  vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: false, message }));

const RELEASES = [{ tag: '1.3.0', imageStatus: 'disponivel' as const }];
const VERSIONS = [
  {
    versionId: '20261010T120000Z-bbbbbbbb',
    release: '1.2.0',
    pages: 12,
    finishedAt: new Date('2026-10-10T12:00:00Z'),
  },
  {
    versionId: '20261001T120000Z-aaaaaaaa',
    release: '1.1.0',
    pages: 10,
    finishedAt: new Date('2026-10-01T12:00:00Z'),
  },
];

const SITE: PublicationSite = {
  lifecycle: 'publicado',
  release: '1.2.0',
  activeVersionId: 'v41',
  state: 'ativo',
  pausedReason: null,
  timeZone: 'America/Sao_Paulo',
};

const QUEUED: OpenExecution = {
  id: 7,
  kind: 'build',
  status: 'na_fila',
  currentStage: null,
  scheduledFor: null,
  startedAt: null,
  requestedBy: 'ana@orakel.local',
  cancelRequestedAt: null,
};
const RUNNING: OpenExecution = { ...QUEUED, status: 'rodando', currentStage: 'render' };
const ROLLING_BACK: OpenExecution = { ...RUNNING, kind: 'rollback', currentStage: null };
const QUEUED_ACTIVITY: SiteActivity = { open: QUEUED, history: [] };

type Props = Partial<Omit<ComponentProps<typeof SiteOperationsScope>, 'children'>> & {
  activity?: SiteActivity;
};

/** O painel com os botões nas etapas, como a página monta com operations.run. */
function Panel({ activity = { open: null, history: [] }, ...props }: Props) {
  const paused = props.paused ?? false;
  return (
    <>
      <SiteOperationsScope
        siteId="exemplo-a"
        release="1.2.0"
        timeZone="America/Sao_Paulo"
        {...props}
        paused={paused}
      >
        <SitePublicationSteps
          site={{ ...SITE, state: paused ? 'pausado' : 'ativo', pausedReason }}
          instance={{ activePages: 120, activeSince: null }}
          activity={activity}
          actions={{
            versao: <SiteOperationButton operation="rebuild" />,
            build: <SiteOperationButton operation="publish" />,
            cancel: <SiteOperationButton operation="cancel" />,
            no_ar: (
              <span className="flex flex-wrap gap-2">
                <SiteOperationButton operation="undo" />
                <SiteOperationButton operation="rollback" />
              </span>
            ),
            site: <SiteOperationButton operation="resume" />,
          }}
        />
        <div data-testid="alert">
          <SiteOperationsAlert />
        </div>
      </SiteOperationsScope>
      <ToastProvider />
    </>
  );
}

const PREVIOUS = VERSIONS[0]!;

const ALL: Props = {
  publish: ok('Build de exemplo-a enfileirado.'),
  pause: ok('exemplo-a pausado.'),
  resume: ok('exemplo-a retomado; build enfileirado.'),
  rebuild: { releases: RELEASES, action: ok('Build enfileirado.') },
  rollback: { versions: VERSIONS, action: ok('Reversão enfileirada.') },
  cancel: ok('Publicação de exemplo-a cancelada.'),
};

function renderPanel(props: ComponentProps<typeof Panel>) {
  return render(<Panel {...props} />, { container: app });
}

const step = (index: number) => {
  const item = within(screen.getByRole('list', { name: 'Etapas da publicação' })).getAllByRole(
    'listitem',
  )[index];
  if (item === undefined) throw new Error(`sem a etapa ${index}`);
  return item;
};
const stepButtons = (index: number) =>
  within(step(index))
    .queryAllByRole('button')
    .map((button) => button.textContent);
const alert = () => within(screen.getByTestId('alert')).getByRole('alert');

describe('ações nas etapas', () => {
  it('cada ação na sua etapa: Versão, Build, No ar e "Pausar" em Site; nenhuma em Infra e zona', () => {
    renderPanel(ALL);

    expect(stepButtons(0)).toEqual([]);
    expect(stepButtons(1)).toEqual(['Reconstruir na release exemplo-a']);
    expect(stepButtons(2)).toEqual(['Publicar agora exemplo-a']);
    expect(stepButtons(3)).toEqual(['Escolher outra versão exemplo-a']);
    expect(stepButtons(4)).toEqual(['Pausar exemplo-a']);
    const publish = screen.getByRole('button', { name: 'Publicar agora exemplo-a' });
    expect(publish.className).toContain('text-error');
    expect(publish.className.split(' ')).toContain(CONTROL_SIZES.sm.h);
  });

  it('pausado, "Retomar" no lugar de "Pausar" na linha Site e "Publicar agora" some', () => {
    renderPanel({ ...ALL, paused: true });

    expect(stepButtons(2)).toEqual([]);
    expect(stepButtons(4)).toEqual(['Retomar exemplo-a']);
    expect(screen.queryByRole('button', { name: /Publicar agora/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pausar/ })).toBeNull();
  });

  it('com publicação na fila, "Publicar agora" (pula a janela) e "Cancelar" na Build', () => {
    renderPanel({ ...ALL, activity: QUEUED_ACTIVITY });

    expect(stepButtons(2)).toEqual(['Publicar agora exemplo-a', 'Cancelar exemplo-a']);
  });

  it('com publicação em andamento, só "Cancelar" na Build', () => {
    renderPanel({ ...ALL, activity: { open: RUNNING, history: [] } });

    expect(stepButtons(2)).toEqual(['Cancelar exemplo-a']);
    expect(screen.queryByRole('button', { name: /Publicar agora/ })).toBeNull();
  });

  it('com reversão em andamento, a Build não oferece "Cancelar"', () => {
    renderPanel({ ...ALL, activity: { open: ROLLING_BACK, history: [] } });

    expect(stepButtons(2)).toEqual(['Publicar agora exemplo-a']);
  });

  it('"Desfazer última publicação" só com versão anterior, ao lado de "Escolher outra versão"', () => {
    const { rerender } = renderPanel(ALL);
    expect(stepButtons(3)).toEqual(['Escolher outra versão exemplo-a']);

    rerender(<Panel {...ALL} undo={{ version: PREVIOUS, action: ok('') }} />);
    expect(stepButtons(3)).toEqual([
      'Desfazer última publicação exemplo-a',
      'Escolher outra versão exemplo-a',
    ]);
  });

  it('sem a lista de releases ou de versões, o botão da etapa não aparece', () => {
    renderPanel({ publish: ok('') });

    expect(stepButtons(1)).toEqual([]);
    expect(stepButtons(3)).toEqual([]);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('confirmação', () => {
  it('"Publicar agora" só publica depois de confirmar; o sucesso vai ao toast', async () => {
    const user = userEvent.setup();
    const publish = ok('Build de exemplo-a enfileirado.');
    renderPanel({ ...ALL, publish });

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }));
    expect(publish).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' });
    await user.click(within(dialog).getByRole('button', { name: 'Publicar' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Build de exemplo-a enfileirado.'),
    );
    expect(publish).toHaveBeenCalledWith('exemplo-a');
    expect(alert().textContent).toBe('');
  });

  it('"Retomar" confirma no diálogo de hoje', async () => {
    const user = userEvent.setup();
    const resume = ok('exemplo-a retomado; build enfileirado.');
    renderPanel({ ...ALL, paused: true, resume });

    await user.click(screen.getByRole('button', { name: 'Retomar exemplo-a' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Retomar exemplo-a?' });
    expect(dialog.textContent).toContain('O site volta a receber builds');
    await user.click(within(dialog).getByRole('button', { name: 'Retomar' }));

    await waitFor(() => expect(resume).toHaveBeenCalledWith('exemplo-a'));
  });

  it('"Reconstruir na release" roda a action com a release escolhida', async () => {
    const user = userEvent.setup();
    const action = ok('Build enfileirado.');
    renderPanel({ ...ALL, paused: true, rebuild: { releases: RELEASES, action } });

    await user.click(screen.getByRole('button', { name: 'Reconstruir na release exemplo-a' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reconstruir o site numa release?',
    });
    expect(dialog.textContent).toContain('O site sai da pausa.');
    await user.click(within(dialog).getByRole('button', { name: 'Reconstruir' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('1.3.0'));
  });

  it('"Escolher outra versão" deixa escolher qualquer versão anterior publicada', async () => {
    const user = userEvent.setup();
    const action = ok('Reversão enfileirada.');
    renderPanel({ ...ALL, rollback: { versions: VERSIONS, action } });

    await user.click(screen.getByRole('button', { name: 'Escolher outra versão exemplo-a' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reverter o site para uma versão anterior?',
    });
    await user.click(within(dialog).getByRole('combobox', { name: 'Versão' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.click(screen.getByText(/20261001T120000Z-aaaaaaaa/));
    await user.click(within(dialog).getByRole('button', { name: 'Reverter' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('20261001T120000Z-aaaaaaaa'));
  });

  it('"Cancelar" só cancela depois de confirmar; o sucesso vai ao toast', async () => {
    const user = userEvent.setup();
    const cancel = ok('Publicação de exemplo-a cancelada.');
    renderPanel({ ...ALL, cancel, activity: { open: RUNNING, history: [] } });

    await user.click(screen.getByRole('button', { name: 'Cancelar exemplo-a' }));
    expect(cancel).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', {
      name: 'Cancelar a publicação de exemplo-a?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar publicação' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Publicação de exemplo-a cancelada.'),
    );
    expect(cancel).toHaveBeenCalledWith('exemplo-a');
  });

  it('"Desfazer última publicação" mostra a versão de destino e desfaz sem escolher', async () => {
    const user = userEvent.setup();
    const action = ok('Rollback de exemplo-a para 20261010T120000Z-bbbbbbbb enfileirado.');
    renderPanel({ ...ALL, undo: { version: PREVIOUS, action } });

    await user.click(screen.getByRole('button', { name: 'Desfazer última publicação exemplo-a' }));
    const dialog = screen.getByRole('alertdialog', {
      name: 'Desfazer a última publicação de exemplo-a?',
    });
    expect(dialog.textContent).toContain(
      '20261010T120000Z-bbbbbbbb · release 1.2.0 · 12 páginas · publicada em 10/10/2026, 09:00 BRT',
    );
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Desfazer' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('exemplo-a'));
  });

  it('Cancelar não roda a ação', async () => {
    const user = userEvent.setup();
    const publish = ok('');
    renderPanel({ ...ALL, publish });

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('recusa e ação em curso', () => {
  const REFUSED = 'Limite diário atingido.';
  it.each([
    ['Publicar agora exemplo-a', 'Publicar', { publish: refused(REFUSED) }],
    [
      'Reconstruir na release exemplo-a',
      'Reconstruir',
      { rebuild: { releases: RELEASES, action: refused(REFUSED) } },
    ],
    [
      'Escolher outra versão exemplo-a',
      'Reverter',
      { rollback: { versions: VERSIONS, action: refused(REFUSED) } },
    ],
    ['Retomar exemplo-a', 'Retomar', { paused: true, resume: refused(REFUSED) }],
    [
      'Cancelar exemplo-a',
      'Cancelar publicação',
      { cancel: refused(REFUSED), activity: QUEUED_ACTIVITY },
    ],
    [
      'Desfazer última publicação exemplo-a',
      'Desfazer',
      { undo: { version: PREVIOUS, action: refused(REFUSED) } },
    ],
  ] as const)('a recusa de "%s" vai ao alerta único do painel', async (name, confirm, props) => {
    const user = userEvent.setup();
    renderPanel({ ...ALL, ...props });

    await user.click(screen.getByRole('button', { name }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: confirm }),
    );

    await waitFor(() => expect(alert().textContent).toBe(REFUSED));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('enquanto uma ação está na fila, ela diz e todas ficam aria-disabled', async () => {
    const user = userEvent.setup();
    let resolve: (result: ActionResult) => void = () => {};
    const publish = vi.fn(
      (): Promise<ActionResult> =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderPanel({ ...ALL, publish });

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publicar' }),
    );
    await screen.findByRole('button', { name: 'Enfileirando… exemplo-a' });
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
    }
    await user.click(screen.getByRole('button', { name: 'Escolher outra versão exemplo-a' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    act(() => resolve({ ok: true, message: 'ok' }));
    expect(await screen.findByRole('button', { name: 'Publicar agora exemplo-a' })).toBeTruthy();
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-disabled')).toBeNull();
    }
  });
});

describe('fora do escopo', () => {
  it('o botão falha e o alerta não renderiza nada', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<SiteOperationButton operation="publish" />)).toThrow(
      'SiteOperationButton fora de um SiteOperationsScope.',
    );
    vi.restoreAllMocks();
    const { container } = render(<SiteOperationsAlert />);
    expect(container.innerHTML).toBe('');
  });
});
