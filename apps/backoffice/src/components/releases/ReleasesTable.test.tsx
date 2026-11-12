// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import type { PreviewState } from '@/domain/preview/preview.ts';
import type { ReleaseRecord } from '@/domain/releases/releases.ts';

import { ReleasesTable } from './ReleasesTable.tsx';

// Registro de releases (#509): tag e data no fuso da operação, a mais recente primeiro; busca
// pela tag com o estado na URL (router.replace simulado); sem releases, o estado vazio. Estado
// do pipeline, "Tentar de novo", "Descartar" e o polling enquanto há release no pipeline (#665).
// Versão da prévia: a tag "Prévia", o aviso do estado e o polling enquanto ela atualiza (#710).

const navigation = vi.hoisted(() => {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: string) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/releases',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

// O "Descartar" confirma num Dialog (react-modal + motion): sem animação e com o elemento do app.
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

afterEach(() => {
  cleanup();
  app.remove();
  navigation.set('');
  vi.useRealTimers();
});

const release = (overrides: Partial<ReleaseRecord> & { tag: string }): ReleaseRecord => ({
  registeredAt: new Date('2026-10-01T12:00Z'),
  imageStatus: null,
  imageCheckedAt: null,
  pipelineState: 'disponivel',
  runId: null,
  runUrl: null,
  failureReason: null,
  requestedBy: null,
  ...overrides,
});

const rows: ReleaseRecord[] = [
  release({ tag: '1.10.0', registeredAt: new Date('2026-11-02T15:00Z') }),
  release({ tag: '1.9.0', registeredAt: new Date('2026-10-20T12:30Z') }),
  release({ tag: '1.8.0', registeredAt: new Date('2026-10-01T12:00Z') }),
];

const RUN = 'https://github.com/Orakel-AI-Content/platform/actions/runs/1';

/** Uma release em cada estado, da mais recente para a mais antiga. */
const pipeline: ReleaseRecord[] = [
  release({
    tag: '2.4.0',
    registeredAt: new Date('2026-11-10T12:00Z'),
    pipelineState: 'gerando',
    runId: '1',
    runUrl: RUN,
  }),
  release({ tag: '2.3.0', registeredAt: new Date('2026-11-09T12:00Z'), pipelineState: 'gerando' }),
  release({
    tag: '2.2.0',
    registeredAt: new Date('2026-11-08T12:00Z'),
    pipelineState: 'baixando',
    runId: '1',
    runUrl: RUN,
  }),
  release({
    tag: '2.1.0',
    registeredAt: new Date('2026-11-07T12:00Z'),
    pipelineState: 'falhou',
    failureReason: 'O E2E da main está vermelho',
    runId: '1',
    runUrl: RUN,
  }),
  release({ tag: '2.0.0', registeredAt: new Date('2026-11-06T12:00Z') }),
  release({
    tag: '1.9.9',
    registeredAt: new Date('2026-11-05T12:00Z'),
    pipelineState: 'descartada',
  }),
];

const previewState = (overrides: Partial<PreviewState> = {}): PreviewState => ({
  status: 'no_ar',
  currentRelease: '1.9.0',
  targetRelease: null,
  failureReason: null,
  updatedAt: new Date('2026-11-12T12:00Z'),
  ...overrides,
});

const notice = () => screen.getByRole('status', { name: 'Estado da prévia' }).textContent;

const rowOf = (tag: string) =>
  screen.getAllByRole('row').find((r) => r.textContent?.startsWith(tag)) as HTMLElement;

const stateOf = (tag: string) => within(rowOf(tag)).getAllByRole('cell')[2]?.textContent;

const buttonsOf = (tag: string) =>
  within(rowOf(tag))
    .queryAllByRole('button')
    .map((button) => button.textContent);

const tags = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('ReleasesTable', () => {
  it('mostra tag e data no fuso da operação, a mais recente primeiro', () => {
    render(<ReleasesTable rows={rows} />);

    expect(tags()).toEqual(['1.10.0', '1.9.0', '1.8.0']);
    expect(screen.getByText(/02\/11\/2026.*12:00/)).toBeTruthy();
  });

  it('ordena pela tag em ordem numérica', async () => {
    render(<ReleasesTable rows={rows} />);

    await userEvent.click(screen.getByRole('button', { name: /Tag/ }));

    expect(tags()).toEqual(['1.8.0', '1.9.0', '1.10.0']);
  });

  it('busca pela tag', async () => {
    render(<ReleasesTable rows={rows} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar pela tag' }), '1.9');
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

    expect(tags()).toEqual(['1.9.0']);
  });

  it('mostra o estado de cada release, com a etapa ou o motivo', () => {
    render(<ReleasesTable rows={pipeline} />);

    expect(screen.getByRole('columnheader', { name: 'Estado' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Imagem' })).toBeNull();
    expect(stateOf('2.3.0')).toBe('GerandoEtapa 1 de 3 · gerando a imagem no CI');
    expect(stateOf('2.2.0')).toMatch(/^BaixandoEtapa 2 de 3 · baixando a imagem/);
    expect(stateOf('2.1.0')).toMatch(/^FalhouO E2E da main está vermelho/);
    expect(stateOf('2.0.0')).toBe('Disponível');
    expect(stateOf('1.9.9')).toBe('Descartada');
  });

  it('liga ao run no GitHub só quando ele existe', () => {
    render(<ReleasesTable rows={pipeline} />);

    const link = within(rowOf('2.4.0')).getByRole('link', {
      name: 'Ver run da release 2.4.0 no GitHub',
    });
    expect(link.getAttribute('href')).toBe(RUN);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(within(rowOf('2.1.0')).getByRole('link')).toBeTruthy();
    expect(within(rowOf('2.3.0')).queryByRole('link')).toBeNull();
    expect(within(rowOf('2.0.0')).queryByRole('link')).toBeNull();
  });

  it('sem as actions, não mostra botões nas linhas', () => {
    render(<ReleasesTable rows={pipeline} />);

    expect(screen.queryByRole('button', { name: /Tentar de novo|Descartar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reconferir/ })).toBeNull();
  });

  it('"Tentar de novo" só em falhou; "Descartar" só sem site usando e fora de descartada', () => {
    const action = vi.fn();
    render(<ReleasesTable rows={pipeline} inUse={['2.0.0']} retry={action} discard={action} />);

    expect(buttonsOf('2.4.0')).toEqual(['Descartar a release 2.4.0']);
    expect(buttonsOf('2.2.0')).toEqual(['Descartar a release 2.2.0']);
    expect(buttonsOf('2.1.0')).toEqual([
      'Tentar de novo a release 2.1.0',
      'Descartar a release 2.1.0',
    ]);
    expect(buttonsOf('2.0.0')).toEqual([]);
    expect(buttonsOf('1.9.9')).toEqual([]);
  });

  it('"Tentar de novo" chama a action com a tag da linha', async () => {
    const retry = vi.fn().mockResolvedValue({ ok: true, message: 'A geração recomeçou.' });
    render(<ReleasesTable rows={pipeline} retry={retry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo a release 2.1.0' }));

    expect(retry).toHaveBeenCalledWith('2.1.0');
  });

  it('"Descartar" pede confirmação antes de chamar a action', async () => {
    const discard = vi.fn().mockResolvedValue({ ok: true, message: 'Descartada.' });
    render(<ReleasesTable rows={pipeline} discard={discard} />);

    await userEvent.click(screen.getByRole('button', { name: 'Descartar a release 2.0.0' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Descartar a release 2.0.0?',
    });
    expect(discard).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(discard).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Descartar a release 2.0.0' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
    );
    expect(discard).toHaveBeenCalledWith('2.0.0');
  });

  it('a recusa de uma ação aparece no Alert, fora da linha', async () => {
    const retry = vi.fn().mockResolvedValue({ ok: false, message: 'A release 2.1.0 não falhou' });
    render(<ReleasesTable rows={pipeline} retry={retry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo a release 2.1.0' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'A release 2.1.0 não falhou',
    );
  });

  it('com release gerando ou baixando, relê a lista até nenhuma ficar no pipeline', async () => {
    vi.useFakeTimers();
    const generating = [release({ tag: '3.0.0', pipelineState: 'gerando' })];
    const status = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [release({ tag: '3.0.0', pipelineState: 'baixando' })],
        inUse: [],
      })
      .mockResolvedValueOnce({
        rows: [release({ tag: '3.0.0', pipelineState: 'disponivel' })],
        inUse: [],
      });
    render(<ReleasesTable rows={generating} status={status} pollMs={1000} />);
    expect(stateOf('3.0.0')).toMatch(/^Gerando/);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(stateOf('3.0.0')).toMatch(/^Baixando/);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(stateOf('3.0.0')).toBe('Disponível');

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('sem release no pipeline, não relê a lista', async () => {
    vi.useFakeTimers();
    const status = vi.fn();
    render(<ReleasesTable rows={rows} status={status} pollMs={1000} />);

    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(status).not.toHaveBeenCalled();
  });

  it('as linhas novas da página substituem as do polling', async () => {
    vi.useFakeTimers();
    const status = vi.fn().mockResolvedValue({
      rows: [release({ tag: '3.0.0', pipelineState: 'baixando' })],
      inUse: [],
    });
    const { rerender } = render(
      <ReleasesTable
        rows={[release({ tag: '3.0.0', pipelineState: 'gerando' })]}
        status={status}
        pollMs={1000}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(stateOf('3.0.0')).toMatch(/^Baixando/);

    rerender(
      <ReleasesTable
        rows={[release({ tag: '3.0.0', pipelineState: 'descartada' })]}
        status={status}
        pollMs={1000}
      />,
    );

    expect(stateOf('3.0.0')).toBe('Descartada');
  });

  it('sem releases, o estado vazio com a ação', () => {
    render(
      <ReleasesTable rows={[]} emptyAction={<button type="button">Gerar nova versão</button>} />,
    );

    expect(screen.getByText('Nenhuma release registrada.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gerar nova versão' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  describe('prévia', () => {
    const previewTags = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .filter((row) => within(row).getAllByRole('cell')[0]?.textContent?.endsWith('Prévia'))
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

    it('no ar, marca só a release da prévia, sem aviso', () => {
      render(<ReleasesTable rows={rows} preview={previewState()} />);

      expect(previewTags()).toEqual(['1.9.0Prévia']);
      expect(notice()).toBe('');
    });

    it('sem o estado da prévia, nenhuma linha tem a tag', () => {
      render(<ReleasesTable rows={rows} />);

      expect(previewTags()).toEqual([]);
      expect(screen.getByRole('status', { name: 'Estado da prévia' }).textContent).toBe('');
    });

    it('atualizando, avisa o alvo e a tag segue na versão que está no ar', () => {
      render(
        <ReleasesTable
          rows={rows}
          preview={previewState({ status: 'atualizando', targetRelease: '1.10.0' })}
        />,
      );

      expect(notice()).toBe('Prévia atualizando para 1.10.0.');
      expect(previewTags()).toEqual(['1.9.0Prévia']);
    });

    it('falhou, avisa o motivo e a versão que continua no ar', () => {
      render(
        <ReleasesTable
          rows={rows}
          preview={previewState({
            status: 'falhou',
            targetRelease: '1.10.0',
            failureReason: 'o healthcheck não respondeu',
          })}
        />,
      );

      expect(notice()).toContain('A troca para 1.10.0 falhou: o healthcheck não respondeu.');
      expect(notice()).toContain('A prévia continua na versão 1.9.0.');
    });

    it('sem versão, avisa que a prévia não tem versão, também sem releases', () => {
      const preview = previewState({ status: 'sem_versao', currentRelease: null });
      render(<ReleasesTable rows={[]} preview={preview} />);

      expect(notice()).toBe('A prévia não tem versão: nenhuma release passou por um build ok.');
      expect(screen.getByText('Nenhuma release registrada.')).toBeTruthy();
    });

    it('atualizando, relê sem release no pipeline até a prévia ficar no ar', async () => {
      vi.useFakeTimers();
      const status = vi
        .fn()
        .mockResolvedValueOnce({
          rows,
          inUse: [],
          preview: previewState({ status: 'atualizando', targetRelease: '1.10.0' }),
        })
        .mockResolvedValueOnce({
          rows,
          inUse: [],
          preview: previewState({ currentRelease: '1.10.0' }),
        });
      render(
        <ReleasesTable
          rows={rows}
          preview={previewState({ status: 'atualizando', targetRelease: '1.10.0' })}
          status={status}
          pollMs={1000}
        />,
      );
      expect(notice()).toBe('Prévia atualizando para 1.10.0.');

      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(notice()).toBe('Prévia atualizando para 1.10.0.');

      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(notice()).toBe('');
      expect(previewTags()).toEqual(['1.10.0Prévia']);

      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(status).toHaveBeenCalledTimes(2);
    });

    it('no ar e sem release no pipeline, não relê', async () => {
      vi.useFakeTimers();
      const status = vi.fn();
      render(<ReleasesTable rows={rows} preview={previewState()} status={status} pollMs={1000} />);

      await act(() => vi.advanceTimersByTimeAsync(5000));

      expect(status).not.toHaveBeenCalled();
    });
  });
});
