'use client';

import { useRef, useState } from 'react';

import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import { Button } from '@/components/ui/Button';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Select from '@/components/ui/Select';

// "Reconstruir na release X" da página do site (#515, workspace#21): o gatilho em contorno de
// erro (muda o site no ar, como "Publicar agora") abre o ConfirmDialog `danger` do Ecme com o
// Select das releases registradas, no molde do `UnpublishDialog`. Começa na release atual do
// site, se registrada, senão na mais recente. A regra é do domínio (`rebuildOnRelease`); o
// sucesso vai ao toast e a recusa ao Alert logo abaixo. Ao fechar, o foco volta ao gatilho. A
// página só monta a ação com operations.run.

export type RebuildOnRelease = (tag: string) => Promise<ActionResult>;

type Option = { value: string; label: string };

export function RebuildReleaseDialog({
  current,
  paused,
  releases,
  action,
}: {
  /** Release atual do site (`sites.release`), ou `null` sem release. */
  current: string | null;
  paused: boolean;
  /** Tags registradas, da mais recente para a mais antiga (`listReleases`). */
  releases: readonly string[];
  action: RebuildOnRelease;
}) {
  const { pending, error, run } = useActionResult();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const initial = current !== null && releases.includes(current) ? current : releases[0];
  const [tag, setTag] = useState<string | undefined>(initial);

  const options: Option[] = releases.map((release) => ({
    value: release,
    label: release === current ? `${release} (atual)` : release,
  }));

  return (
    <div className="space-y-2">
      <Button
        ref={trigger}
        type="button"
        size="sm"
        customColorClass={dangerButtonClass}
        // `aria-disabled`, não `disabled`, durante o envio: o diálogo fecha antes da resposta, e
        // um botão desabilitado não recebe o foco que volta a ele.
        aria-disabled={pending || undefined}
        onClick={() => {
          if (pending) return;
          setTag(initial);
          setOpen(true);
        }}
      >
        {pending ? 'Reconstruindo…' : 'Reconstruir na release'}
      </Button>
      <ConfirmDialog
        isOpen={open}
        type="danger"
        title="Reconstruir o site numa release?"
        confirmText="Reconstruir"
        confirmButtonProps={{ ...dangerConfirmButtonProps, disabled: tag === undefined }}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          if (tag === undefined) return;
          setOpen(false);
          run(() => action(tag));
        }}
        onAfterClose={() => trigger.current?.focus()}
      >
        <p className="mb-4">
          {tag === undefined
            ? 'Nenhuma release registrada: cadastre uma em Releases antes de reconstruir.'
            : `O site passa a usar a imagem site-builder:${tag}, o build entra na fila já e o site no ar muda.`}
          {paused && ' O site sai da pausa.'}
        </p>
        <FormContainer>
          <FormItem label="Release" className="mb-0">
            <Select<Option>
              options={options}
              value={options.find((option) => option.value === tag) ?? null}
              onChange={(option) => setTag(option?.value)}
              placeholder="Escolha uma release"
              noOptionsMessage={() => 'Nenhuma release registrada'}
            />
          </FormItem>
        </FormContainer>
      </ConfirmDialog>
      <ActionAlert error={error} />
    </div>
  );
}
