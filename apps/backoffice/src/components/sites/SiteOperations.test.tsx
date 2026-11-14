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
// "Escolher outra versão do motor" (o "Reconstruir na release") na Versão, "Publicar agora" na Build, "Escolher outra versão" na No ar
// e, na linha Site, "Pausar" com motivo (#650) ou, pausado, "Retomar", cada uma com a confirmação de hoje (#327, #514, #515); o
// sucesso vai ao toast e a recusa de qualquer uma ao `SiteOperationsAlert`, abaixo do painel.
// "Cancelar" fica ao lado de "Publicar agora" com publicação na fila e no lugar dele em
// andamento; "Desfazer última publicação" fica ao lado de "Escolher outra versão" (#649).
// "Atualizar para a mais recente" (#690) e "Voltar à versão anterior (X)" (#691) ficam na Versão,
// antes do "Escolher outra versão do motor". Foco no
// navegador, em `SiteOperations.browser.test.tsx`.

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

const RELEASES = [{ tag: '1.3.0' }];
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
const QUEUED_ACTIVITY: SiteActivity = { open: QUEUED, openInfra: null, history: [] };

type Props = Partial<Omit<ComponentProps<typeof SiteOperationsScope>, 'children'>>;

/** O painel com os botões nas etapas, como a página monta com operations.run. */
function Panel({
  pausedReason = null,
  activity = { open: null, openInfra: null, history: [] },
  ...props
}: Props & { pausedReason?: string | null; activity?: SiteActivity }) {
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
            versao: (
              <span className="flex flex-wrap gap-2">
                <SiteOperationButton operation="update" />
                <SiteOperationButton operation="revert" />
                <SiteOperationButton operation="rebuild" />
              </span>
            ),
            build: <SiteOperationButton operation="publish" />,
            cancel: <SiteOperationButton operation="cancel" />,
            no_ar: (
              <span className="flex flex-wrap gap-2">
                <SiteOperationButton operation="undo" />
                <SiteOperationButton operation="rollback" />
              </span>
            ),
            site: (
              <>
                <SiteOperationButton operation="pause" />
                <SiteOperationButton operation="resume" />
              </>
            ),
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
    expect(stepButtons(1)).toEqual(['Escolher outra versão do motor exemplo-a']);
    expect(stepButtons(2)).toEqual(['Publicar agora exemplo-a']);
    expect(stepButtons(3)).toEqual(['Escolher outra versão exemplo-a']);
    expect(stepButtons(4)).toEqual(['Pausar exemplo-a']);
    const publish = screen.getByRole('button', { name: 'Publicar agora exemplo-a' });
    expect(publish.className).toContain('text-success');
    expect(publish.className.split(' ')).toContain(CONTROL_SIZES.sm.h);
  });

  it('a cor do botão diz a função: verde avança, âmbar volta ou interrompe, vermelho aborta', () => {
    const { rerender } = renderPanel({
      ...ALL,
      activity: QUEUED_ACTIVITY,
      update: { tag: '1.5.0', action: ok('') },
      revert: { tag: '1.1.0', action: ok('') },
      undo: { version: PREVIOUS, action: ok('') },
    });
    const color = (name: RegExp) => {
      const classes = screen.getByRole('button', { name }).className.split(' ');
      return ['success', 'warning', 'error'].find((token) => classes.includes(`text-${token}`));
    };

    expect(color(/^Publicar agora/)).toBe('success');
    expect(color(/^Atualizar para a mais recente/)).toBe('success');
    expect(color(/^Voltar à versão anterior/)).toBe('warning');
    expect(color(/^Escolher outra versão do motor/)).toBe('warning');
    expect(color(/^Escolher outra versão exemplo-a/)).toBe('warning');
    expect(color(/^Desfazer última publicação/)).toBe('warning');
    expect(color(/^Pausar/)).toBe('warning');
    expect(color(/^Cancelar/)).toBe('error');

    rerender(<Panel {...ALL} paused />);
    expect(color(/^Retomar/)).toBe('success');
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
    renderPanel({ ...ALL, activity: { open: RUNNING, openInfra: null, history: [] } });

    expect(stepButtons(2)).toEqual(['Cancelar exemplo-a']);
    expect(screen.queryByRole('button', { name: /Publicar agora/ })).toBeNull();
  });

  it('com reversão em andamento, a Build não oferece "Cancelar"', () => {
    renderPanel({ ...ALL, activity: { open: ROLLING_BACK, openInfra: null, history: [] } });

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

  it('"Atualizar para a mais recente" só com release mais recente, antes do "Escolher outra"', () => {
    const { rerender } = renderPanel(ALL);
    expect(stepButtons(1)).toEqual(['Escolher outra versão do motor exemplo-a']);

    rerender(<Panel {...ALL} update={{ tag: '1.3.0', action: ok('') }} />);
    expect(stepButtons(1)).toEqual([
      'Atualizar para a mais recente exemplo-a',
      'Escolher outra versão do motor exemplo-a',
    ]);
  });

  it('"Voltar à versão anterior (X)" só com anterior válida, com a versão no nome', () => {
    const { rerender } = renderPanel({ ...ALL, update: { tag: '1.5.0', action: ok('') } });
    expect(screen.queryByRole('button', { name: /Voltar à versão anterior/ })).toBeNull();

    rerender(
      <Panel
        {...ALL}
        update={{ tag: '1.5.0', action: ok('') }}
        revert={{ tag: '1.1.0', action: ok('') }}
      />,
    );
    expect(stepButtons(1)).toEqual([
      'Atualizar para a mais recente exemplo-a',
      'Voltar à versão anterior (1.1.0) exemplo-a',
      'Escolher outra versão do motor exemplo-a',
    ]);
  });

  it('os gatilhos de "Escolher outra" da Versão e da No ar têm nomes acessíveis distintos', () => {
    renderPanel(ALL);

    const versao = within(step(1)).getByRole('button');
    const noAr = within(step(3)).getByRole('button');
    expect(versao.textContent).toBe('Escolher outra versão do motor exemplo-a');
    expect(noAr.textContent).toBe('Escolher outra versão exemplo-a');
    expect(screen.getAllByRole('button', { name: 'Escolher outra versão exemplo-a' })).toEqual([
      noAr,
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

  it('"Escolher outra versão do motor" roda a action com a release escolhida', async () => {
    const user = userEvent.setup();
    const action = ok('Build enfileirado.');
    renderPanel({ ...ALL, paused: true, rebuild: { releases: RELEASES, action } });

    await user.click(
      screen.getByRole('button', { name: 'Escolher outra versão do motor exemplo-a' }),
    );
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

  it('"Pausar" roda a action com o motivo; revalidada, a linha Site mostra o motivo', async () => {
    const user = userEvent.setup();
    const pause = ok('exemplo-a pausado.');
    const { rerender } = renderPanel({ ...ALL, pause });

    await user.click(screen.getByRole('button', { name: 'Pausar exemplo-a' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Pausar exemplo-a?' });
    await user.type(within(dialog).getByRole('textbox', { name: /Motivo/ }), 'migração de domínio');
    await user.click(within(dialog).getByRole('button', { name: 'Pausar' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('exemplo-a pausado.'));
    expect(pause).toHaveBeenCalledWith('migração de domínio');
    // A revalidação da Server Action traz o site pausado com o motivo.
    rerender(<Panel {...ALL} pause={pause} paused pausedReason="migração de domínio" />);
    expect(step(4).textContent).toContain('Pausado: migração de domínio');
    expect(stepButtons(4)).toEqual(['Retomar exemplo-a']);
  });

  it('a recusa de "Pausar" vai ao alerta único do painel', async () => {
    const user = userEvent.setup();
    renderPanel({ ...ALL, pause: refused('O site já está pausado.') });

    await user.click(screen.getByRole('button', { name: 'Pausar exemplo-a' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Pausar exemplo-a?' });
    await user.type(within(dialog).getByRole('textbox', { name: /Motivo/ }), 'manutenção');
    await user.click(within(dialog).getByRole('button', { name: 'Pausar' }));

    await waitFor(() => expect(alert().textContent).toBe('O site já está pausado.'));
  });

  it('"Cancelar" só cancela depois de confirmar; o sucesso vai ao toast', async () => {
    const user = userEvent.setup();
    const cancel = ok('Publicação de exemplo-a cancelada.');
    renderPanel({ ...ALL, cancel, activity: { open: RUNNING, openInfra: null, history: [] } });

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

  it('"Atualizar para a mais recente" diz a versão de destino e roda a action com ela', async () => {
    const user = userEvent.setup();
    const action = ok('exemplo-a na release 1.3.0; build enfileirado.');
    renderPanel({ ...ALL, update: { tag: '1.3.0', action } });

    await user.click(
      screen.getByRole('button', { name: 'Atualizar para a mais recente exemplo-a' }),
    );
    expect(action).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', {
      name: 'Atualizar exemplo-a para a versão 1.3.0?',
    });
    expect(dialog.textContent).toContain('O site passa a usar a versão 1.3.0');
    expect(dialog.textContent).not.toContain('sai da pausa');
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Atualizar' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'exemplo-a na release 1.3.0; build enfileirado.',
      ),
    );
    expect(action).toHaveBeenCalledWith('1.3.0');
  });

  it('pausado, a confirmação do "Atualizar" diz que o site sai da pausa', async () => {
    const user = userEvent.setup();
    renderPanel({ ...ALL, paused: true, update: { tag: '1.3.0', action: ok('') } });

    await user.click(
      screen.getByRole('button', { name: 'Atualizar para a mais recente exemplo-a' }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Atualizar exemplo-a para a versão 1.3.0?',
    });
    expect(dialog.textContent).toContain('O site sai da pausa.');
  });

  it('"Voltar à versão anterior" diz a versão de destino e roda a action do site', async () => {
    const user = userEvent.setup();
    const action = ok('exemplo-a de volta à release 1.1.0; build enfileirado.');
    renderPanel({ ...ALL, revert: { tag: '1.1.0', action } });

    await user.click(
      screen.getByRole('button', { name: 'Voltar à versão anterior (1.1.0) exemplo-a' }),
    );
    expect(action).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', {
      name: 'Voltar exemplo-a para a versão 1.1.0?',
    });
    expect(dialog.textContent).toContain('O site volta a usar a versão 1.1.0');
    expect(dialog.textContent).not.toContain('sai da pausa');
    await user.click(within(dialog).getByRole('button', { name: 'Voltar' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'exemplo-a de volta à release 1.1.0; build enfileirado.',
      ),
    );
    expect(action).toHaveBeenCalledWith('exemplo-a');
  });

  it('pausado, a confirmação do "Voltar" diz que o site sai da pausa', async () => {
    const user = userEvent.setup();
    renderPanel({ ...ALL, paused: true, revert: { tag: '1.1.0', action: ok('') } });

    await user.click(
      screen.getByRole('button', { name: 'Voltar à versão anterior (1.1.0) exemplo-a' }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Voltar exemplo-a para a versão 1.1.0?',
    });
    expect(dialog.textContent).toContain('O site sai da pausa.');
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
      'Escolher outra versão do motor exemplo-a',
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
    [
      'Atualizar para a mais recente exemplo-a',
      'Atualizar',
      { update: { tag: '1.3.0', action: refused(REFUSED) } },
    ],
    [
      'Voltar à versão anterior (1.1.0) exemplo-a',
      'Voltar',
      { revert: { tag: '1.1.0', action: refused(REFUSED) } },
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
