'use client';

import { useId, useState, type ReactNode } from 'react';

import { ActionAlert } from '@/components/shared/ActionFeedback.tsx';
import { Button } from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import Dialog from '@/components/ui/Dialog';

// Resumo e resultado do lote da fila de revisão (#776): o Dialog do Ecme, como o
// `ScheduleDialog`, em duas etapas. No resumo, os títulos selecionados e a confirmação de leitura,
// que habilita o envio: é ela que o domínio grava como o checklist de cada artigo (ADR 0024 da
// unidade). No resultado, o que foi ao ar, o que ficou agendado (data e hora de São Paulo, com o
// aviso do transbordo) e o que falhou, com o motivo. Regra nenhuma aqui: elegibilidade,
// confirmações, limite diário e transbordo são do domínio (`approveAndPublishBatch`). Enquanto o
// envio corre, o Dialog não fecha.

/** Artigo selecionado na fila: a versão que o revisor viu e o título que o resumo mostra. */
export type BatchSelection = { id: number; version: number; title: string };

/**
 * Desfecho de um artigo do lote, pronto para o resultado: no ar, agendado em `at` (data e hora de
 * São Paulo, o dia do limite diário) com o aviso do transbordo, ou falhou, com o motivo.
 */
export type BatchItemResult =
  | { contentId: number; outcome: 'published' }
  | { contentId: number; outcome: 'scheduled'; at: string; warning?: string }
  | { contentId: number; outcome: 'failed'; message: string };

/** Lote enviado (um desfecho por artigo, na ordem enviada) ou recusado inteiro. */
export type ApproveBatchResult =
  { ok: true; items: BatchItemResult[] } | { ok: false; message: string };

export type ApproveBatch = (
  siteId: string,
  items: { contentId: number; version: number }[],
) => Promise<ApproveBatchResult>;

const count = new Intl.NumberFormat('pt-BR');

/** "1 conteúdo", "12 conteúdos". */
export const contentCount = (total: number) =>
  total === 1 ? '1 conteúdo' : `${count.format(total)} conteúdos`;

export function ApproveBatchDialog({
  siteId,
  isOpen,
  items,
  action,
  onClose,
  onAfterClose,
}: {
  siteId: string;
  isOpen: boolean;
  /** Os selecionados no momento em que o resumo abriu. */
  items: readonly BatchSelection[];
  action: ApproveBatch;
  /** Fechar (Cancelar, Esc, o X ou Concluir no resultado); quem abre zera a seleção depois do envio. */
  onClose: (sent: boolean) => void;
  /**
   * Depois de fechar, quando o react-modal já devolveu o foco ao que estava focado antes. Se o
   * gatilho saiu da tela (a fila mudou com o envio), quem abre leva o foco a outro lugar.
   */
  onAfterClose?: () => void;
}) {
  const id = useId();
  const [read, setRead] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchItemResult[] | null>(null);

  const close = () => {
    if (pending) return;
    onClose(result !== null);
  };

  const send = async () => {
    if (!read || pending) return;
    setPending(true);
    setError(null);
    try {
      const sent = await action(
        siteId,
        items.map((item) => ({ contentId: item.id, version: item.version })),
      );
      if (sent.ok) setResult(sent.items);
      else setError(sent.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      aria={{ labelledby: `${id}-title` }}
      // Cada abertura começa do resumo, sem a leitura confirmada.
      onAfterClose={() => {
        setRead(false);
        setError(null);
        setResult(null);
        onAfterClose?.();
      }}
    >
      {result === null ? (
        <Summary
          id={id}
          items={items}
          read={read}
          pending={pending}
          error={error}
          onRead={setRead}
          onCancel={close}
          onSend={() => void send()}
        />
      ) : (
        <Outcome id={id} items={items} result={result} onClose={close} />
      )}
    </Dialog>
  );
}

function Summary({
  id,
  items,
  read,
  pending,
  error,
  onRead,
  onCancel,
  onSend,
}: {
  id: string;
  items: readonly BatchSelection[];
  read: boolean;
  pending: boolean;
  error: string | null;
  onRead: (read: boolean) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <h4 id={`${id}-title`}>Aprovar e publicar {contentCount(items.length)}?</h4>
      <p className="mt-4">
        Cada conteúdo é aprovado com o checklist confirmado em seu nome e vai ao ar agora, ou na
        próxima vaga se o limite diário do site estiver cheio.
      </p>
      <ul className="mt-4 max-h-60 list-disc space-y-1 overflow-y-auto pl-5">
        {items.map((item) => (
          <li key={item.id} className="heading-text">
            {item.title}
          </li>
        ))}
      </ul>
      <Checkbox className="mt-4" checked={read} onChange={(checked) => onRead(checked)}>
        Li os conteúdos selecionados e confirmo o checklist de cada um
      </Checkbox>
      <ActionAlert error={error} className="mt-4" />
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" size="sm" aria-disabled={pending || undefined} onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="solid"
          size="sm"
          // `aria-disabled` durante o envio: o botão mantém o foco enquanto espera a resposta.
          disabled={!read}
          aria-disabled={pending || undefined}
        >
          {pending ? 'Publicando…' : 'Aprovar e publicar'}
        </Button>
      </div>
    </form>
  );
}

function Outcome({
  id,
  items,
  result,
  onClose,
}: {
  id: string;
  items: readonly BatchSelection[];
  result: readonly BatchItemResult[];
  onClose: () => void;
}) {
  const titleOf = (contentId: number) =>
    items.find((item) => item.id === contentId)?.title ?? `Conteúdo ${String(contentId)}`;
  const published = result.filter((item) => item.outcome === 'published');
  const scheduled = result.filter(
    (item): item is Extract<BatchItemResult, { outcome: 'scheduled' }> =>
      item.outcome === 'scheduled',
  );
  const failed = result.filter(
    (item): item is Extract<BatchItemResult, { outcome: 'failed' }> => item.outcome === 'failed',
  );

  return (
    <>
      <h4 id={`${id}-title`}>Resultado do lote</h4>
      <div className="mt-4 max-h-96 space-y-4 overflow-y-auto">
        {published.length > 0 && (
          <Group title={`Foram ao ar (${count.format(published.length)})`}>
            {published.map((item) => (
              <li key={item.contentId}>{titleOf(item.contentId)}</li>
            ))}
          </Group>
        )}
        {scheduled.length > 0 && (
          <Group title={`Agendados (${count.format(scheduled.length)})`}>
            {scheduled.map((item) => (
              <li key={item.contentId}>
                {titleOf(item.contentId)}: agendado para {item.at}.
                {item.warning !== undefined && (
                  <span className="block text-sm text-warning">{item.warning}</span>
                )}
              </li>
            ))}
          </Group>
        )}
        {failed.length > 0 && (
          <Group title={`Falharam (${count.format(failed.length)})`}>
            {failed.map((item) => (
              <li key={item.contentId}>
                {titleOf(item.contentId)}: {item.message}
              </li>
            ))}
          </Group>
        )}
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="button" variant="solid" size="sm" onClick={onClose}>
          Concluir
        </Button>
      </div>
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h5 id={id} className="mb-2">
        {title}
      </h5>
      <ul className="list-disc space-y-1 pl-5">{children}</ul>
    </section>
  );
}
