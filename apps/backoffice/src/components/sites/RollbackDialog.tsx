'use client';

import { useState } from 'react';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, { dangerConfirmButtonProps } from '@/components/shared/ConfirmDialog.tsx';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Select from '@/components/ui/Select';
import type { RollbackVersion } from '@/domain/builds/builds.ts';

// "Reverter" da página do site (#514, workspace#21), no molde do `RebuildReleaseDialog`: o
// ConfirmDialog `danger` do Ecme com o Select das versões dos builds `ok`, sem a ativa
// (`listRollbackVersions`), começando na mais recente a cada abertura. Sem gatilho próprio
// (#595): quem abre (o "Mais ações" do `SiteOperations`) guarda o estado, roda a action com a
// versão do `onConfirm` e devolve o foco no `onAfterClose`. A regra é do domínio
// (`requestRollback`).

export type RollbackSite = (versionId: string) => Promise<ActionResult>;

type Option = { value: string; label: string };

export function RollbackDialog({
  versions,
  timeZone,
  isOpen,
  onCancel,
  onConfirm,
  onAfterClose,
}: {
  /** Versões revertíveis, da mais recente para a mais antiga. */
  versions: readonly RollbackVersion[];
  timeZone: string;
  isOpen: boolean;
  onCancel: () => void;
  /** Confirmado com a versão escolhida. */
  onConfirm: (versionId: string) => void;
  /** Depois de fechar: devolve o foco a quem abriu. */
  onAfterClose?: () => void;
}) {
  const initial = versions[0]?.versionId;
  const [versionId, setVersionId] = useState<string | undefined>(initial);
  // A cada abertura, volta à versão mais recente.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setVersionId(initial);
  }

  const options: Option[] = versions.map((version) => ({
    value: version.versionId,
    label: `${formatDateTime(version.finishedAt, timeZone)} · ${version.release} · ${version.versionId}`,
  }));

  return (
    <ConfirmDialog
      isOpen={isOpen}
      type="danger"
      title="Reverter o site para uma versão anterior?"
      confirmText="Reverter"
      confirmButtonProps={{ ...dangerConfirmButtonProps, disabled: versionId === undefined }}
      onCancel={onCancel}
      onConfirm={() => {
        if (versionId !== undefined) onConfirm(versionId);
      }}
      onAfterClose={onAfterClose}
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
  );
}
