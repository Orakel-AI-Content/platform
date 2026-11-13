'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useRef, useState, type ReactNode } from 'react';
import * as z from 'zod';

import { ScheduleDialog } from '@/components/contents/ScheduleDialog.tsx';
import {
  SchemaForm,
  type FieldProps,
  type SchemaFormActionHelpers,
  type SchemaFormIssue,
} from '@/components/forms/SchemaForm';
import { ActionAlert } from '@/components/shared/ActionFeedback.tsx';
import type { FormActionResult } from '@/components/shared/actionResult.ts';
import { CONTENT_STATUS_LABEL } from '@/components/shared/siteLabels.ts';
import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import Alert from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import Input from '@/components/ui/Input';
import { Steps } from '@/components/ui/Steps';
import type { ContentListItem } from '@/domain/content/contents.ts';

// Painel da tela de revisão (#75), ao lado da visualização a partir de `xl` e abaixo dela antes
// (#373). É um wizard de quatro passos (#766) sobre o `Steps` do Ecme, no exemplo "Controlled":
// Checagens (`checks`, workspace#87), Ajustes (a correção, #767), Leitura (o checklist) e Decisão
// (as aprovações e a devolução), com "Anterior" e "Próximo" no rodapé. Em Ajustes fica o editor
// no modo `amend` (#751), montado pela página com a Server Action dele: a prévia continua ao
// lado, e salvar volta à revisão neste passo, já na versão nova. Sem `content.amend`, ou com a
// versão fora de revisão, o passo diz por que não há correção.
// Os quatro passos ficam montados e os inativos levam `hidden`: voltar a um passo encontra as
// caixas e o comentário digitado como estavam. O passo atual fica em `?passo=` (`router.replace`,
// como o período da audiência), e a página o devolve na prop `step`: a troca de versão remonta o
// painel (`key`) no mesmo passo. Quando o botão acionado fica desabilitado (primeiro ou último
// passo), o foco vai para o outro, e não para o `body`.
// A página decide permissão e estado no servidor e passa os itens do checklist (REVIEW_CHECKLIST,
// do domínio, que não pode ir para o bundle do cliente) e as confirmações já gravadas na versão
// (#749). Cada caixa grava ao ser clicada (#752): a tela muda na hora e fica com as chaves que o
// domínio devolve; uma recusa desfaz a mudança e aparece no `ActionAlert` do cartão. "Marcar
// todos" grava as três. As aprovações não enviam nada: só ficam habilitadas com todas gravadas, e
// o domínio confere de novo. São três (workspace#89): "Aprovar e publicar agora", "Aprovar e
// agendar" (o Dialog de agendamento da página do conteúdo) e "Só aprovar", o envio do
// formulário; as duas primeiras são ações próprias do rodapé (`card.actions`), com o mesmo resumo
// de erros. Depois de publicar ou agendar, o desfecho ("foi ao ar", "agendado para…") fica no
// cartão da decisão, com o aviso quando o dia pedido estava cheio e a publicação foi para a
// próxima vaga; o toast repete os dois. Visual do Ecme (#277): o conteúdo em `Card`s; o `<aside>`
// fica por fora para manter o landmark e tem o nome por `aria-label`. As seções são seções da tela
// (`h2`, #372). A validação da release é um item das checagens (`erro`): só ela, além do
// checklist, bloqueia as aprovações (`blocked`), com o aviso no `Alert` de erro do Ecme (#444),
// sem `role="alert"`: chega no carregamento. "Devolver ao editor" (#598) tem cartão próprio, com
// o comentário obrigatório, e não depende do checklist nem da validação. Decidida a versão, os
// dois formulários saem.

export type ChecklistItem = { key: string; label: string };

/** Os passos da revisão, na ordem; `key` é o valor de `?passo=`. */
const STEPS = [
  { key: 'checagens', title: 'Checagens' },
  { key: 'ajustes', title: 'Ajustes' },
  { key: 'leitura', title: 'Leitura' },
  { key: 'decisao', title: 'Decisão' },
] as const;

const STEP_PARAM = 'passo';
const LAST_STEP = STEPS.length - 1;

/** Índice do passo de `?passo=`; ausente ou desconhecido é o primeiro. */
const stepIndex = (step: string | undefined) =>
  Math.max(
    0,
    STEPS.findIndex((item) => item.key === step),
  );

type FormAction = () => Promise<FormActionResult<SchemaFormIssue>>;

/** Desfecho de aprovar e publicar ou agendar: `warning` é o aviso do transbordo. */
export type DecisionOutcome =
  | { ok: true; message: string; warning?: string }
  | { ok: false; message: string; issues: SchemaFormIssue[] };

type Decided = { message: string; warning?: string };

/** Resultado de gravar confirmações: as chaves gravadas na versão depois, ou a recusa. */
export type ConfirmOutcome = { ok: true; confirmed: string[] } | { ok: false; message: string };

const SAVE_FAILED = 'Não foi possível gravar a confirmação; tente de novo.';

const returnSchema = z.object({
  comment: z.string().trim().min(1, 'Escreva o que o editor precisa corrigir.'),
});

/** Comentário da devolução em várias linhas, no `Input` de texto longo do Ecme. */
function CommentField({ id, ref, value, onChange, invalid, required, describedBy }: FieldProps) {
  return (
    <Input
      textArea
      id={id}
      // O `ref` do Input do Ecme também admite um componente; o foco do erro só precisa do DOM.
      ref={(element) => ref(element instanceof HTMLElement ? element : null)}
      rows={4}
      aria-invalid={invalid}
      aria-required={required || undefined}
      aria-describedby={describedBy}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const RETURN_FIELDS = { comment: (props: FieldProps) => <CommentField {...props} /> };

/** O checklist fica fora do schema: o envio de "Aprovar" não leva nada (#752). */
const approveSchema = z.object({});

const withKey = (keys: readonly string[], key: string) =>
  keys.includes(key) ? [...keys] : [...keys, key];
const withoutKey = (keys: readonly string[], key: string) => keys.filter((item) => item !== key);

/**
 * Confirmações gravadas, com a mudança otimista: `write` aplica `optimistic` na hora, roda a
 * ação e fica com as chaves devolvidas (só as da gravação mais recente, se várias se cruzarem);
 * na recusa, aplica `rollback` e guarda a mensagem para o `ActionAlert`.
 */
function useConfirmations(initial: readonly string[]) {
  const [confirmed, setConfirmed] = useState<readonly string[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const latest = useRef(0);

  const write = async (
    optimistic: (keys: readonly string[]) => readonly string[],
    rollback: (keys: readonly string[]) => readonly string[],
    run: () => Promise<ConfirmOutcome>,
  ) => {
    setError(null);
    setConfirmed(optimistic);
    const call = ++latest.current;
    setInFlight((count) => count + 1);
    let outcome: ConfirmOutcome;
    try {
      outcome = await run();
    } catch {
      outcome = { ok: false, message: SAVE_FAILED };
    }
    setInFlight((count) => count - 1);
    if (!outcome.ok) {
      setConfirmed(rollback);
      setError(outcome.message);
    } else if (call === latest.current) {
      setConfirmed(outcome.confirmed);
    }
  };

  return { confirmed, error, saving: inFlight > 0, write };
}

export function ReviewPanel({
  version,
  status,
  step,
  checks,
  amend,
  canAmend,
  blocked,
  checklist,
  confirmed: initialConfirmed,
  canApprove,
  confirm,
  confirmAll,
  approve,
  approvePublish,
  approveSchedule,
  giveBack,
}: {
  version: number;
  status: ContentListItem['status'];
  /** O passo de `?passo=`, lido pela página (`checagens`, `ajustes`, `leitura` ou `decisao`). */
  step?: string;
  /** Seção de checagens automáticas (`ReviewChecks`), no passo Checagens. */
  checks?: ReactNode;
  /**
   * O editor da correção (`ContentEditor` no modo `amend`), no passo Ajustes; a página só o
   * monta com `content.amend` e a versão em revisão.
   */
  amend?: ReactNode;
  /** `content.amend` (corrigir durante a revisão), decidido no servidor. */
  canAmend: boolean;
  /** Alguma checagem com `erro` (a validação da release): as aprovações ficam desabilitadas. */
  blocked: boolean;
  checklist: readonly ChecklistItem[];
  /** Chaves do checklist já gravadas na versão (`reviewConfirmations`). */
  confirmed: readonly string[];
  /** `content.publish` (aprovar, devolver e marcar), decidido no servidor. */
  canApprove: boolean;
  /** Grava (`true`) ou apaga uma confirmação (`confirmAction`). */
  confirm: (key: string, confirmed: boolean) => Promise<ConfirmOutcome>;
  /** Grava ou apaga todas (`confirmAllAction`); "Marcar todos" passa `true`. */
  confirmAll: (confirmed: boolean) => Promise<ConfirmOutcome>;
  /** "Só aprovar": aprova com as confirmações gravadas (`approveVersion`). */
  approve: FormAction;
  /** Aprova e publica na hora, ou na próxima vaga (`approveAndPublish`). */
  approvePublish: () => Promise<DecisionOutcome>;
  /** Aprova e agenda para o instante em ISO, ou para a próxima vaga (`approveAndSchedule`). */
  approveSchedule: (at: string) => Promise<DecisionOutcome>;
  /** Devolve ao editor com o comentário (`returnVersion`). */
  giveBack: (comment: string) => Promise<FormActionResult<SchemaFormIssue>>;
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [current, setCurrent] = useState(() => stepIndex(step));
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // Decidida nesta tela: os formulários saem e a confirmação vai para o toast (pelo SchemaForm).
  const [decided, setDecided] = useState(false);
  // Desfecho de publicar ou agendar, que fica no cartão da decisão.
  const [outcome, setOutcome] = useState<Decided | null>(null);
  // Qual das ações próprias do rodapé está em curso, para o rótulo dela.
  const [running, setRunning] = useState<'publish' | 'schedule' | null>(null);
  const inReview = status === 'em_revisao';
  const open = canApprove && inReview && !decided;
  const { confirmed, error, saving, write } = useConfirmations(initialConfirmed);
  const complete = checklist.every((item) => confirmed.includes(item.key));
  const approveDisabled = blocked || !complete || saving;
  // Decidida a versão nesta tela, também não há mais o que corrigir.
  const amendOpen = canAmend && inReview && !decided && amend !== undefined;
  const amendHint = amendOpen
    ? `Corrija aqui o que precisar; salvar grava a versão ${version + 1}, ainda em revisão. Nada a ajustar? Siga para a leitura.`
    : decided
      ? 'A revisão desta versão já foi decidida: não há correção disponível.'
      : !inReview
        ? `Esta versão está ${CONTENT_STATUS_LABEL[status].toLowerCase()}: só uma versão em revisão pode ser corrigida.`
        : 'Só quem pode corrigir conteúdo em revisão ajusta esta versão: não há correção disponível.';
  const approveDescribedBy =
    [blocked && `${id}-blocked`, !complete && `${id}-incomplete`].filter(Boolean).join(' ') ||
    undefined;

  /** Vai ao passo `index` e o grava em `?passo=`, sem mexer nos outros parâmetros. */
  const goTo = (index: number) => {
    // O botão acionado fica desabilitado no primeiro e no último passo: o foco passa ao outro.
    if (index === LAST_STEP) previousRef.current?.focus();
    if (index === 0) nextRef.current?.focus();
    setCurrent(index);
    const next = new URLSearchParams(params);
    next.set(STEP_PARAM, STEPS[index]!.key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  /** Roda publicar ou agendar pelo formulário: a recusa vai ao resumo e o sucesso fica no cartão. */
  const decide = (
    { run }: SchemaFormActionHelpers,
    kind: 'publish' | 'schedule',
    action: () => Promise<DecisionOutcome>,
  ) =>
    run(async () => {
      setRunning(kind);
      try {
        const result = await action();
        if (!result.ok) return result.issues;
        setOutcome({ message: result.message, warning: result.warning });
        setDecided(true);
        return { success: [result.message, result.warning].filter(Boolean).join(' ') };
      } finally {
        setRunning(null);
      }
    });

  const decisionTitle = <h2 className={SECTION_TITLE_CLASS}>Decisão</h2>;

  const panels: Record<(typeof STEPS)[number]['key'], ReactNode> = {
    checagens: checks,
    ajustes: (
      <div className="flex flex-col gap-4">
        <Card bodyClass="space-y-3">
          <h2 className={SECTION_TITLE_CLASS}>Ajustes</h2>
          <p className={SECTION_HINT_CLASS}>{amendHint}</p>
        </Card>
        {amendOpen && amend}
      </div>
    ),
    leitura: (
      <Card bodyClass="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={SECTION_TITLE_CLASS}>Checklist</h2>
          {open && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const before = confirmed;
                void write(
                  () => checklist.map((item) => item.key),
                  () => before,
                  () => confirmAll(true),
                );
              }}
            >
              Marcar todos
            </Button>
          )}
        </div>
        {open ? (
          <div className="flex flex-col gap-3">
            {checklist.map((item) => (
              <Checkbox
                key={item.key}
                name={item.key}
                checked={confirmed.includes(item.key)}
                onChange={(checked) => {
                  void write(
                    (keys) => (checked ? withKey(keys, item.key) : withoutKey(keys, item.key)),
                    (keys) => (checked ? withoutKey(keys, item.key) : withKey(keys, item.key)),
                    () => confirm(item.key, checked),
                  );
                }}
              >
                {item.label}
              </Checkbox>
            ))}
          </div>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {checklist.map((item) => (
              <li key={item.key}>{item.label}</li>
            ))}
          </ul>
        )}
        <ActionAlert error={error} />
      </Card>
    ),
    decisao: open ? (
      <div className="flex flex-col gap-4">
        <SchemaForm
          schema={approveSchema}
          defaultValues={{}}
          card={{
            intro: (
              <>
                {decisionTitle}
                {blocked && (
                  <Alert type="danger" showIcon duration={0}>
                    <p id={`${id}-blocked`} className="text-sm">
                      Corrija os erros das checagens automáticas antes de aprovar.
                    </p>
                  </Alert>
                )}
                {!complete && (
                  <p id={`${id}-incomplete`} className={SECTION_HINT_CLASS}>
                    Marque todos os itens para aprovar.
                  </p>
                )}
              </>
            ),
            actions: (helpers) => (
              <>
                <ScheduleDialog
                  label={running === 'schedule' ? 'Agendando…' : 'Aprovar e agendar'}
                  disabled={approveDisabled || helpers.pending}
                  describedBy={approveDescribedBy}
                  onSchedule={(at) =>
                    decide(helpers, 'schedule', () => approveSchedule(at.toISOString()))
                  }
                />
                <Button
                  type="button"
                  disabled={approveDisabled || helpers.pending}
                  aria-describedby={approveDescribedBy}
                  onClick={() => decide(helpers, 'publish', approvePublish)}
                >
                  {running === 'publish' ? 'Publicando…' : 'Aprovar e publicar agora'}
                </Button>
              </>
            ),
          }}
          submitLabel="Só aprovar"
          pendingLabel="Aprovando…"
          submitDisabled={approveDisabled}
          submitDescribedBy={approveDescribedBy}
          onSubmit={async () => {
            const result = await approve();
            if (!result.ok) return result.issues;
            setDecided(true);
            return { success: result.message };
          }}
        />
        <SchemaForm
          schema={returnSchema}
          defaultValues={{ comment: '' }}
          labels={{ comment: 'O que corrigir' }}
          fields={RETURN_FIELDS}
          card={{
            intro: (
              <>
                <h2 className={SECTION_TITLE_CLASS}>Devolver ao editor</h2>
                <p className={SECTION_HINT_CLASS}>
                  A versão volta a rascunho e sai da fila; o comentário aparece para quem edita.
                </p>
              </>
            ),
          }}
          submitLabel="Devolver ao editor"
          pendingLabel="Devolvendo…"
          onSubmit={async ({ comment }) => {
            const result = await giveBack(comment);
            if (!result.ok) return result.issues;
            setDecided(true);
            return { success: result.message };
          }}
        />
      </div>
    ) : (
      <Card bodyClass="space-y-3">
        {decisionTitle}
        {outcome !== null && (
          <div className="space-y-2">
            <Alert type="success" showIcon duration={0}>
              <p className="text-sm">{outcome.message}</p>
            </Alert>
            {outcome.warning !== undefined && (
              <Alert type="warning" showIcon duration={0}>
                <p className="text-sm">{outcome.warning}</p>
              </Alert>
            )}
          </div>
        )}
        {!inReview && !decided && (
          <p className={SECTION_HINT_CLASS}>
            Esta versão está {CONTENT_STATUS_LABEL[status].toLowerCase()}: só uma versão em revisão
            pode ser aprovada.
          </p>
        )}
        {inReview && !canApprove && (
          <p className={SECTION_HINT_CLASS}>Só quem pode publicar decide a revisão.</p>
        )}
      </Card>
    ),
  };

  return (
    <aside aria-label={`Revisão da versão ${version}`} className="flex flex-col gap-4">
      <Card>
        <Steps current={current} aria-label="Passos da revisão">
          {STEPS.map((item) => (
            <Steps.Item key={item.key} title={item.title} />
          ))}
        </Steps>
      </Card>

      {STEPS.map((item, index) => (
        <div key={item.key} hidden={index !== current} data-step={item.key}>
          {panels[item.key]}
        </div>
      ))}

      <div className="flex justify-end gap-2">
        <Button
          ref={previousRef}
          type="button"
          disabled={current === 0}
          onClick={() => goTo(current - 1)}
        >
          Anterior
        </Button>
        <Button
          ref={nextRef}
          type="button"
          variant="solid"
          disabled={current === LAST_STEP}
          onClick={() => goTo(current + 1)}
        >
          Próximo
        </Button>
      </div>
    </aside>
  );
}
