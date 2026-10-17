'use client';

import {
  createContext,
  use,
  useId,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/legacy-ui/button';
import { Input } from '@/components/legacy-ui/input';
import { Label } from '@/components/legacy-ui/label';
import { Textarea } from '@/components/legacy-ui/textarea';
import type { SiteSummary } from '@/domain/sites/sites.ts';

// Ações da página do site, no padrão do "Publicar agora": a Server Action delega ao domínio
// e o retorno é anunciado em role=status. A página só as mostra com site.configure.

type ActionState = { ok: boolean; message: string };

function useAction() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionState | null>(null);
  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => setStatus(await action()));
  return { pending, status, setStatus, run };
}

function Status({ status }: { status: ActionState | null }) {
  return (
    <p
      role="status"
      className={
        status?.ok === false ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
      }
    >
      {status?.message}
    </p>
  );
}

const NEXT_STEP = {
  cadastrado: { step: 'infra_aplicada', label: 'Marcar infra aplicada' },
  infra_aplicada: { step: 'zona_ativa', label: 'Marcar zona ativa' },
} as const;

type Step = (typeof NEXT_STEP)[keyof typeof NEXT_STEP]['step'];

const LifecycleActionContext = createContext<ReturnType<typeof useAction> | null>(null);

/**
 * Guarda o estado da ação do ciclo de vida fora do item da etapa: ao avançar, a página
 * revalida e o botão passa ao item seguinte (remontado), mas o retorno continua em role=status
 * logo abaixo do stepper (#148).
 */
export function LifecycleActionScope({ children }: { children: ReactNode }) {
  const state = useAction();
  return (
    <LifecycleActionContext value={state}>
      {children}
      <Status status={state.status} />
    </LifecycleActionContext>
  );
}

/**
 * Só o próximo passo manual válido; `publicado` vem do build. Sem passo manual não renderiza
 * nada (zona ativa e publicado). Fica dentro de um `LifecycleActionScope`.
 */
export function LifecycleAction({
  lifecycle,
  action,
}: {
  lifecycle: SiteSummary['lifecycle'];
  action: (step: Step) => Promise<ActionState>;
}) {
  const scope = use(LifecycleActionContext);
  if (scope === null) throw new Error('LifecycleAction fora de um LifecycleActionScope.');
  if (lifecycle !== 'cadastrado' && lifecycle !== 'infra_aplicada') return null;
  const next = NEXT_STEP[lifecycle];
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={scope.pending}
      onClick={() => scope.run(() => action(next.step))}
    >
      {scope.pending ? 'Salvando…' : next.label}
    </Button>
  );
}

/** Registro do G1 com observação opcional. */
export function RegisterG1Form({ action }: { action: (note: string) => Promise<ActionState> }) {
  const id = useId();
  const [note, setNote] = useState('');
  const { pending, status, run } = useAction();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(() => action(note));
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-note`}>Observação do G1</Label>
        <Textarea
          id={`${id}-note`}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Registrando…' : 'Registrar G1'}
      </Button>
      <Status status={status} />
    </form>
  );
}

/** Janela própria em segundos; "Usar padrão" volta a BUILD_WINDOW_SECONDS. */
export function BuildWindowForm({
  own,
  action,
}: {
  own: number | null;
  action: (seconds: number | null) => Promise<ActionState>;
}) {
  const id = useId();
  const [value, setValue] = useState(own === null ? '' : String(own));
  const { pending, status, setStatus, run } = useAction();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const seconds = Number(value);
    if (value.trim() === '' || !Number.isInteger(seconds) || seconds < 0) {
      setStatus({ ok: false, message: 'Informe um número inteiro de segundos, 0 ou mais.' });
      return;
    }
    run(() => action(seconds));
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor={`${id}-seconds`}>Janela própria (segundos)</Label>
        <Input
          id={`${id}-seconds`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Salvar janela
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            setValue('');
            run(() => action(null));
          }}
        >
          Usar padrão
        </Button>
      </div>
      <Status status={status} />
    </form>
  );
}
