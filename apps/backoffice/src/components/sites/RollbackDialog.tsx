'use client';

import { useRef, useState } from 'react';

import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import { Button } from '@/components/ui/Button';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Select from '@/components/ui/Select';
import type { RollbackVersion } from '@/domain/builds/builds.ts';

// "Reverter" da página do site (#514, workspace#21), no molde do `RebuildReleaseDialog`: o
// gatilho em contorno de erro (muda o site no ar) abre o ConfirmDialog `danger` do Ecme com o
// Select das versões dos builds `ok`, sem a ativa (`listRollbackVersions`), começando na mais
// recente. A regra é do domínio (`requestRollback`); o sucesso vai ao toast e a recusa ao Alert
// logo abaixo. Ao fechar, o foco volta ao gatilho. A página só monta a ação com operations.run.

export type RollbackSite = (versionId: string) => Promise<ActionResult>;

type Option = { value: string; label: string };

export function RollbackDialog({
  versions,
  timeZone,
  action,
}: {
  /** Versões revertíveis, da mais recente para a mais antiga. */
  versions: readonly RollbackVersion[];
  timeZone: string;
  action: RollbackSite;
}) {
  const { pending, error, run } = useActionResult();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const initial = versions[0]?.versionId;
  const [versionId, setVersionId] = useState<string | undefined>(initial);

  const options: Option[] = versions.map((version) => ({
    value: version.versionId,
    label: `${formatDateTime(version.finishedAt, timeZone)} · ${version.release} · ${version.versionId}`,
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
          setVersionId(initial);
          setOpen(true);
        }}
      >
        {pending ? 'Revertendo…' : 'Reverter'}
      </Button>
      <ConfirmDialog
        isOpen={open}
        type="danger"
        title="Reverter o site para uma versão anterior?"
        confirmText="Reverter"
        confirmButtonProps={{ ...dangerConfirmButtonProps, disabled: versionId === undefined }}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          if (versionId === undefined) return;
          setOpen(false);
          run(() => action(versionId));
        }}
        onAfterClose={() => trigger.current?.focus()}
      >
        <p className="mb-4">
          {versionId === undefined
            ? 'Nenhuma versão anterior publicada para reverter.'
            : `O rollback entra na fila já e o site no ar volta para a versão ${versionId}. O estado do site não muda: se ele estiver ativo, o próximo build volta a publicar o conteúdo corrente.`}
        </p>
        <FormContainer>
          <FormItem label="Versão" className="mb-0">
            <Select<Option>
              options={options}
              value={options.find((option) => option.value === versionId) ?? null}
              onChange={(option) => setVersionId(option?.value)}
              placeholder="Escolha uma versão"
              noOptionsMessage={() => 'Nenhuma versão anterior'}
            />
          </FormItem>
        </FormContainer>
      </ConfirmDialog>
      <ActionAlert error={error} />
    </div>
  );
}
