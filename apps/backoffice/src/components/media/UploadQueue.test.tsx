// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONCURRENCY,
  MAX_FILES,
  UploadList,
  useUploadQueue,
  type SendFile,
  type SendResult,
  type UploadStatus,
} from './UploadQueue.tsx';

// Fila de envio (#188): no máximo 20 por vez, 3 subindo ao mesmo tempo, progresso por arquivo
// e o resultado de cada um pela leitura dos envios por chave. O XHR é trocado por um `send`
// controlado; o envio de verdade fica no E2E.

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

/** Linha de um arquivo: o texto do estado. */
const stateOf = (name: string) =>
  within(screen.getByRole('list', { name: 'Envios' }))
    .getByText(name)
    .closest('li')
    ?.querySelector('[role="status"]')?.textContent;

/** Classe do estado de um arquivo (cor de estado). */
const stateClassOf = (name: string) =>
  within(screen.getByRole('list', { name: 'Envios' }))
    .getByText(name)
    .closest('li')
    ?.querySelector('[role="status"]')?.className;

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

    expect(screen.getByText(/Só as 20 primeiras imagens foram enviadas/)).toBeTruthy();
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
