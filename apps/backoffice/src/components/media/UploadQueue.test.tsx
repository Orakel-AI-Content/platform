// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONCURRENCY,
  MAX_FILES,
  queueSummary,
  UploadList,
  type UploadEntry,
  useUploadQueue,
  type SendFile,
  type SendResult,
  type UploadStatus,
} from './UploadQueue.tsx';

// Fila de envio (#188): no máximo 20 por vez, 3 subindo ao mesmo tempo, progresso por arquivo
// e o resultado de cada um pela leitura dos envios por chave. O XHR é trocado por um `send`
// controlado; o envio de verdade fica no E2E. Enquanto sobe, a barra do `Progress`; a fila tem
// um único `role="status"` com o aviso e o resumo (#375).

afterEach(cleanup);

const file = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/jpeg' });

/** A fila de verdade, com um botão que adiciona os arquivos recebidos. */
function Harness(props: {
  files: File[];
  send: SendFile;
  status: (keys: string[]) => Promise<UploadStatus[] | null>;
  onReady?: () => void;
  timeoutMs?: number;
}) {
  const queue = useUploadQueue({
    send: props.send,
    status: props.status,
    onReady: props.onReady ?? (() => undefined),
    pollMs: 5,
    timeoutMs: props.timeoutMs,
  });
  return (
    <>
      <button type="button" onClick={() => queue.add(props.files)}>
        Enviar
      </button>
      <UploadList entries={queue.entries} notice={queue.notice} />
    </>
  );
}

/** Linha de um arquivo na lista. */
const rowOf = (name: string) => {
  const row = within(screen.getByRole('list', { name: 'Envios' }))
    .getByText(name)
    .closest('li');
  if (row === null) throw new Error(`Sem linha para ${name}`);
  return row;
};

/** Texto do estado de um arquivo (o `span` depois do nome). */
const stateOf = (name: string) => rowOf(name).querySelectorAll('span')[1]?.textContent;

/** Classe do estado de um arquivo (cor de estado). */
const stateClassOf = (name: string) => rowOf(name).querySelectorAll('span')[1]?.className;

describe('fila de envio', () => {
  it('cada arquivo mostra o progresso e depois o resultado; um recusado não para os outros', async () => {
    const send = vi.fn<SendFile>((sent, onProgress) => {
      onProgress(50);
      if (sent.name === 'texto.txt') {
        return Promise.resolve({
          ok: false,
          reason: 'O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
        });
      }
      return Promise.resolve({ ok: true, uploadKey: `uploads/exemplo-a/${sent.name}` });
    });
    const status = vi.fn((keys: string[]) =>
      Promise.resolve(
        keys.map((uploadKey): UploadStatus =>
          uploadKey.endsWith('quebrada.jpg')
            ? {
                uploadKey,
                status: 'recusada',
                reason: 'A imagem está corrompida ou não pôde ser lida',
                mediaId: null,
              }
            : { uploadKey, status: 'pronta', reason: null, mediaId: 9 },
        ),
      ),
    );
    const onReady = vi.fn();
    render(
      <Harness
        files={[file('praia.jpg'), file('texto.txt'), file('quebrada.jpg')]}
        send={send}
        status={status}
        onReady={onReady}
      />,
    );

    act(() => screen.getByRole('button', { name: 'Enviar' }).click());

    await waitFor(() => expect(stateOf('praia.jpg')).toBe('pronta'));
    expect(stateOf('texto.txt')).toBe(
      'recusada: O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
    );
    await waitFor(() =>
      expect(stateOf('quebrada.jpg')).toBe(
        'recusada: A imagem está corrompida ou não pôde ser lida',
      ),
    );
    expect(send).toHaveBeenCalledTimes(3);
    expect(onReady).toHaveBeenCalled();
    expect(stateClassOf('praia.jpg')).toBe('text-success');
    expect(stateClassOf('texto.txt')).toBe('text-error');
  });

  it('mostra a porcentagem enquanto sobe', async () => {
    let finish: (result: SendResult) => void = () => undefined;
    const send: SendFile = (_, onProgress) => {
      onProgress(37);
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    render(<Harness files={[file('grande.jpg')]} send={send} status={() => Promise.resolve([])} />);

    act(() => screen.getByRole('button', { name: 'Enviar' }).click());

    await waitFor(() => expect(stateOf('grande.jpg')).toBe('enviando 37%'));
    act(() => finish({ ok: true, uploadKey: 'uploads/exemplo-a/grande.jpg' }));
    await waitFor(() => expect(stateOf('grande.jpg')).toBe('processando'));
  });

  it('enquanto sobe, a linha tem a barra com o percentual e o nome do arquivo', async () => {
    let progress: (percent: number) => void = () => undefined;
    let finish: (result: SendResult) => void = () => undefined;
    const send: SendFile = (_, onProgress) => {
      progress = onProgress;
      onProgress(37);
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    render(<Harness files={[file('grande.jpg')]} send={send} status={() => Promise.resolve([])} />);

    act(() => screen.getByRole('button', { name: 'Enviar' }).click());

    await waitFor(() => expect(stateOf('grande.jpg')).toBe('enviando 37%'));
    const bar = within(rowOf('grande.jpg')).getByRole('progressbar', { name: /grande\.jpg/ });
    expect(bar.getAttribute('aria-valuenow')).toBe('37');

    // Só o percentual mudou: a barra acompanha, o anúncio da fila não.
    const announced = screen.getByRole('status').textContent;
    expect(announced).toBe('1 envio: 1 enviando');
    act(() => progress(80));
    await waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('80'));
    expect(screen.getByRole('status').textContent).toBe(announced);

    // Fora de "enviando", a linha não tem barra.
    act(() => finish({ ok: true, uploadKey: 'uploads/exemplo-a/grande.jpg' }));
    await waitFor(() => expect(stateOf('grande.jpg')).toBe('processando'));
    expect(within(rowOf('grande.jpg')).queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1 envio: 1 processando');
  });

  it(`sobe no máximo ${CONCURRENCY} ao mesmo tempo`, async () => {
    const waiting: ((result: SendResult) => void)[] = [];
    const send = vi.fn<SendFile>(
      () =>
        new Promise((resolve) => {
          waiting.push(resolve);
        }),
    );
    render(
      <Harness
        files={['a', 'b', 'c', 'd', 'e'].map((name) => file(`${name}.jpg`))}
        send={send}
        status={() => Promise.resolve([])}
      />,
    );

    act(() => screen.getByRole('button', { name: 'Enviar' }).click());

    await waitFor(() => expect(send).toHaveBeenCalledTimes(CONCURRENCY));
    expect(stateOf('d.jpg')).toBe('aguardando');
    act(() => waiting[0]?.({ ok: true, uploadKey: 'k-a' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(CONCURRENCY + 1));
  });

  it(`mais de ${MAX_FILES} arquivos: avisa e só os ${MAX_FILES} primeiros entram`, () => {
    const send = vi.fn<SendFile>(() => new Promise(() => undefined));
    render(
      <Harness
        files={Array.from({ length: 25 }, (_, index) => file(`foto-${index + 1}.jpg`))}
        send={send}
        status={() => Promise.resolve([])}
      />,
    );

    act(() => screen.getByRole('button', { name: 'Enviar' }).click());

    // Uma região só para a fila, com o aviso primeiro e o resumo depois; nenhuma por linha.
    const [region, ...others] = screen.getAllByRole('status');
    expect(others).toHaveLength(0);
    expect(region?.textContent).toBe(
      `Só as ${MAX_FILES} primeiras imagens foram enviadas; envie as outras em seguida. ` +
        `${MAX_FILES} envios: ${MAX_FILES - CONCURRENCY} aguardando, ${CONCURRENCY} enviando`,
    );
    expect(
      within(screen.getByRole('list', { name: 'Envios' })).getAllByRole('listitem'),
    ).toHaveLength(MAX_FILES);
    expect(screen.queryByText('foto-21.jpg')).toBeNull();
  });

  it('passado o tempo-limite, o envio aparece como ainda processando', async () => {
    const send: SendFile = () => Promise.resolve({ ok: true, uploadKey: 'k' });
    const status = vi.fn(() =>
      Promise.resolve([
        { uploadKey: 'k', status: 'processando', reason: null, mediaId: null },
      ] as UploadStatus[]),
    );
    render(<Harness files={[file('lenta.jpg')]} send={send} status={status} timeoutMs={0} />);

    act(() => screen.getByRole('button', { name: 'Enviar' }).click());

    await waitFor(() =>
      expect(stateOf('lenta.jpg')).toBe('ainda processando; recarregue a página mais tarde'),
    );
  });
});

describe('resumo da fila', () => {
  const entry = (id: number, state: UploadEntry['state']): UploadEntry => ({
    id,
    name: `foto-${id}.jpg`,
    state,
  });

  it('vazio sem envio', () => {
    expect(queueSummary([])).toBe('');
  });

  it('conta por estado, na ordem da fila, só os estados presentes', () => {
    expect(
      queueSummary([
        entry(1, { kind: 'pronta' }),
        entry(2, { kind: 'recusada', reason: 'x' }),
        entry(3, { kind: 'enviando', percent: 12 }),
        entry(4, { kind: 'pronta' }),
        entry(5, { kind: 'demorando' }),
        entry(6, { kind: 'aguardando' }),
        entry(7, { kind: 'processando', uploadKey: 'k', deadline: 0 }),
      ]),
    ).toBe(
      '7 envios: 1 aguardando, 1 enviando, 1 processando, 2 prontas, 1 recusada, 1 ainda processando',
    );
  });

  it('não muda com o percentual', () => {
    expect(queueSummary([entry(1, { kind: 'enviando', percent: 5 })])).toBe(
      queueSummary([entry(1, { kind: 'enviando', percent: 95 })]),
    );
  });
});
