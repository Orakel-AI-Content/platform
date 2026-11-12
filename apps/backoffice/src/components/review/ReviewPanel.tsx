'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import * as z from 'zod';

import { SchemaForm, type FieldProps, type SchemaFormIssue } from '@/components/forms/SchemaForm';
import { ActionAlert } from '@/components/shared/ActionFeedback.tsx';
import type { FormActionResult } from '@/components/shared/actionResult.ts';
import { CONTENT_STATUS_LABEL } from '@/components/shared/siteLabels.ts';
import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import Alert from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import Input from '@/components/ui/Input';
import type { ContentListItem } from '@/domain/content/contents.ts';

// Painel da tela de revisão (#75), ao lado da visualização a partir de `xl` e abaixo dela antes
// (#373): checagens automáticas (`checks`, workspace#87), checklist e aprovação. A página decide
// permissão e estado no servidor e passa os itens do checklist (REVIEW_CHECKLIST, do domínio, que
// não pode ir para o bundle do cliente) e as confirmações já gravadas na versão (#749). Cada caixa
// grava ao ser clicada (#752): a tela muda na hora e fica com as chaves que o domínio devolve; uma
// recusa desfaz a mudança e aparece no `ActionAlert` do cartão. "Marcar todos" grava as três.
// "Aprovar" não envia nada: só fica habilitado com todas gravadas e o domínio confere de novo.
// Visual do Ecme (#277): o conteúdo em `Card`s, com as cores do `@theme`; o `<aside>` fica por fora
// para manter o landmark. O checklist tem cartão próprio, com "Aprovar" no rodapé dele (#333) e
// "Marcar todos" no topo. As seções são seções da tela (`h2`, como "Dados" e "Blocos" na versão,
// #372); o `<aside>` tem o nome por `aria-label`, sem `h2` oculto, e a prévia em nova aba é ação do
// cabeçalho da página. A validação da release é um item das checagens (`erro`): só ela, além do
// checklist, bloqueia "Aprovar" (`blocked`), com o aviso no `Alert` de erro do Ecme (#444), sem
// `role="alert"`: chega no carregamento, não é retorno de uma ação. Abaixo do checklist, "Devolver
// ao editor" (#598) em cartão próprio, com o comentário obrigatório: não depende do checklist nem
// da validação, porque devolver não leva nada ao site. Decidida a versão (aprovada ou devolvida),
// os dois formulários saem.

export type ChecklistItem = { key: string; label: string };

type FormAction = () => Promise<FormActionResult<SchemaFormIssue>>;

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
  checks,
  blocked,
  checklist,
  confirmed: initialConfirmed,
  canApprove,
  confirm,
  confirmAll,
  approve,
  giveBack,
}: {
  version: number;
  status: ContentListItem['status'];
  /** Seção de checagens automáticas (`ReviewChecks`), no topo do painel. */
  checks?: ReactNode;
  /** Alguma checagem com `erro` (a validação da release): "Aprovar" fica desabilitado. */
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
  /** Aprova com as confirmações gravadas (`approveVersion`). */
  approve: FormAction;
  /** Devolve ao editor com o comentário (`returnVersion`). */
  giveBack: (comment: string) => Promise<FormActionResult<SchemaFormIssue>>;
}) {
  const id = useId();
  // Decidida nesta tela: os formulários saem e a confirmação vai para o toast (pelo SchemaForm).
  const [decided, setDecided] = useState(false);
  const inReview = status === 'em_revisao';
  const open = canApprove && inReview && !decided;
  const { confirmed, error, saving, write } = useConfirmations(initialConfirmed);
  const complete = checklist.every((item) => confirmed.includes(item.key));
  const checklistTitle = (
    <h2 id={`${id}-checklist`} className={SECTION_TITLE_CLASS}>
      Checklist
    </h2>
  );

  return (
    <aside aria-label={`Revisão da versão ${version}`} className="flex flex-col gap-4">
      {checks}

      <section aria-labelledby={`${id}-checklist`}>
        {open ? (
          <SchemaForm
            schema={approveSchema}
            defaultValues={{}}
            card={{
              intro: (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {checklistTitle}
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
                  </div>
                  {blocked && (
                    <Alert type="danger" showIcon duration={0}>
                      <p id={`${id}-blocked`} className="text-sm">
                        Corrija os erros das checagens automáticas antes de aprovar.
                      </p>
                    </Alert>
                  )}
                  <div className="flex flex-col gap-3">
                    {checklist.map((item) => (
                      <Checkbox
                        key={item.key}
                        name={item.key}
                        checked={confirmed.includes(item.key)}
                        onChange={(checked) => {
                          void write(
                            (keys) =>
                              checked ? withKey(keys, item.key) : withoutKey(keys, item.key),
                            (keys) =>
                              checked ? withoutKey(keys, item.key) : withKey(keys, item.key),
                            () => confirm(item.key, checked),
                          );
                        }}
                      >
                        {item.label}
                      </Checkbox>
                    ))}
                  </div>
                  {!complete && (
                    <p id={`${id}-incomplete`} className={SECTION_HINT_CLASS}>
                      Marque todos os itens para aprovar.
                    </p>
                  )}
                  <ActionAlert error={error} />
                </>
              ),
            }}
            submitLabel="Aprovar"
            pendingLabel="Aprovando…"
            submitDisabled={blocked || !complete || saving}
            submitDescribedBy={
              [blocked && `${id}-blocked`, !complete && `${id}-incomplete`]
                .filter(Boolean)
                .join(' ') || undefined
            }
            onSubmit={async () => {
              const outcome = await approve();
              if (!outcome.ok) return outcome.issues;
              setDecided(true);
              return { success: outcome.message };
            }}
          />
        ) : (
          <Card bodyClass="space-y-3">
            {checklistTitle}
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {checklist.map((item) => (
                <li key={item.key}>{item.label}</li>
              ))}
            </ul>
            {!inReview && !decided && (
              <p className={SECTION_HINT_CLASS}>
                Esta versão está {CONTENT_STATUS_LABEL[status].toLowerCase()}: só uma versão em
                revisão pode ser aprovada.
              </p>
            )}
          </Card>
        )}
      </section>

      {open && (
        <section aria-labelledby={`${id}-return`}>
          <SchemaForm
            schema={returnSchema}
            defaultValues={{ comment: '' }}
            labels={{ comment: 'O que corrigir' }}
            fields={RETURN_FIELDS}
            card={{
              intro: (
                <>
                  <h2 id={`${id}-return`} className={SECTION_TITLE_CLASS}>
                    Devolver ao editor
                  </h2>
                  <p className={SECTION_HINT_CLASS}>
                    A versão volta a rascunho e sai da fila; o comentário aparece para quem edita.
                  </p>
                </>
              ),
            }}
            submitLabel="Devolver ao editor"
            pendingLabel="Devolvendo…"
            onSubmit={async ({ comment }) => {
              const outcome = await giveBack(comment);
              if (!outcome.ok) return outcome.issues;
              setDecided(true);
              return { success: outcome.message };
            }}
          />
        </section>
      )}
    </aside>
  );
}
