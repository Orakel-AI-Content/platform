'use client';

import { useId, useState, useTransition } from 'react';
import { TbPlus } from 'react-icons/tb';

import { ActionAlert, pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { Button } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Segment } from '@/components/ui/Segment';
import { RELEASE_BUMPS, type ReleaseBump } from '@/domain/releases/next-version.ts';

// "Gerar nova versão" da lista de Releases (#664, workspace#81): o botão e o Dialog do Ecme com
// o Segment dos três tipos de mudança, cada um com o número proposto, sem campo para digitar.
// O número é só proposta (a página o calcula com `nextVersion`): o domínio recalcula na
// transação (`requestNewRelease`), e o toast usa a tag que ele devolve. O sucesso fecha o
// diálogo e vai ao toast; a recusa fica no Alert do diálogo. Cada abertura volta a "correção".

/** Próximo número para cada tipo de mudança (`nextVersion` sobre as tags registradas). */
export type ReleaseProposals = Record<ReleaseBump, string>;

export type RequestNewRelease = (bump: ReleaseBump) => Promise<ActionResult>;

const BUMP_LABELS: Record<ReleaseBump, string> = {
  patch: 'Correção',
  minor: 'Melhoria',
  major: 'Mudança grande',
};

const isBump = (value: unknown): value is ReleaseBump =>
  RELEASE_BUMPS.includes(value as ReleaseBump);

export function NewReleaseDialog({
  proposals,
  action,
}: {
  proposals: ReleaseProposals;
  action: RequestNewRelease;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState<ReleaseBump>('patch');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openDialog = () => {
    setBump('patch');
    setError(null);
    setOpen(true);
  };
  const close = () => {
    if (!pending) setOpen(false);
  };
  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await action(bump);
      if (result.ok) {
        setOpen(false);
        pushSuccess(result.message);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="solid"
        aria-haspopup="dialog"
        icon={<TbPlus className="text-xl" aria-hidden />}
        onClick={openDialog}
      >
        Gerar nova versão
      </Button>
      <Dialog isOpen={open} title="Gerar nova versão" onClose={close}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <p id={`${id}-type`} className="mb-2">
            Tipo de mudança
          </p>
          <Segment
            aria-labelledby={`${id}-type`}
            className="flex-wrap"
            value={bump}
            onChange={(value) => {
              // Em `single`, o Segment não desmarca o item ativo; o valor é sempre um tipo.
              if (isBump(value)) setBump(value);
            }}
          >
            {RELEASE_BUMPS.map((item) => (
              <Segment.Item key={item} value={item} disabled={pending}>
                {BUMP_LABELS[item]} <span className="tabular-nums">{proposals[item]}</span>
              </Segment.Item>
            ))}
          </Segment>
          <p className="mt-4">
            A versão <span className="font-semibold tabular-nums">{proposals[bump]}</span> começa a
            ser gerada agora.
          </p>
          <ActionAlert error={error} className="mt-4" />
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" variant="solid" size="sm" loading={pending}>
              {pending ? 'Gerando…' : 'Gerar'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
