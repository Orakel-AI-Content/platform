'use client';

import { useState } from 'react';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, { dangerConfirmButtonProps } from '@/components/shared/ConfirmDialog.tsx';
import { Alert } from '@/components/ui/Alert';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Select from '@/components/ui/Select';
import type { ReleaseImageStatus } from '@/domain/releases/releases.ts';

// "Reconstruir na release X" da página do site (#515, workspace#21): o ConfirmDialog `danger` do
// Ecme com o Select das releases registradas, no molde do `UnpublishDialog`. Começa na release
// atual do site, se registrada, senão na mais recente, a cada abertura. Sem gatilho próprio
// (#595): quem abre (o "Mais ações" do `SiteOperations`) guarda o estado, roda a action com a
// tag do `onConfirm` e devolve o foco no `onAfterClose`, como o `PublishNowDialog` (#586). A
// regra é do domínio (`rebuildOnRelease`). Com a imagem da release escolhida ausente do host
// na última conferência (#574), um Alert de aviso no diálogo; o confirmar segue habilitado,
// porque a imagem pode ter sido baixada depois e a falha do build é a proteção final.

export type RebuildOnRelease = (tag: string) => Promise<ActionResult>;

/** Release registrada e o estado da imagem no host (`listReleases`); `null` = não conferida. */
export type RebuildRelease = { tag: string; imageStatus: ReleaseImageStatus | null };

type Option = { value: string; label: string };

export function RebuildReleaseDialog({
  current,
  paused,
  releases,
  isOpen,
  onCancel,
  onConfirm,
  onAfterClose,
}: {
  /** Release atual do site (`sites.release`), ou `null` sem release. */
  current: string | null;
  paused: boolean;
  /** Releases registradas, da mais recente para a mais antiga (`listReleases`). */
  releases: readonly RebuildRelease[];
  isOpen: boolean;
  onCancel: () => void;
  /** Confirmado com a release escolhida. */
  onConfirm: (tag: string) => void;
  /** Depois de fechar: devolve o foco a quem abriu. */
  onAfterClose?: () => void;
}) {
  const initial =
    current !== null && releases.some((release) => release.tag === current)
      ? current
      : releases[0]?.tag;
  const [tag, setTag] = useState<string | undefined>(initial);
  // A cada abertura, volta à release inicial (o estado anterior ao render, como o React indica).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setTag(initial);
  }
  const imageMissing = releases.find((release) => release.tag === tag)?.imageStatus === 'ausente';

  const options: Option[] = releases.map(({ tag: release }) => ({
    value: release,
    label: release === current ? `${release} (atual)` : release,
  }));

  return (
    <ConfirmDialog
      isOpen={isOpen}
      type="danger"
      title="Reconstruir o site numa release?"
      confirmText="Reconstruir"
      confirmButtonProps={{ ...dangerConfirmButtonProps, disabled: tag === undefined }}
      onCancel={onCancel}
      onConfirm={() => {
        if (tag !== undefined) onConfirm(tag);
      }}
      onAfterClose={onAfterClose}
    >
      <p className="mb-4">
        {tag === undefined
          ? 'Nenhuma release registrada: cadastre uma em Releases antes de reconstruir.'
          : `O site passa a usar a imagem site-builder:${tag}, o build entra na fila já e o site no ar muda.`}
        {paused && ' O site sai da pausa.'}
      </p>
      {imageMissing && (
        <Alert type="warning" showIcon duration={0} className="mb-4">
          A imagem site-builder:{tag} não estava no host na última conferência. Se ela não for
          baixada antes, o build falha na etapa de imagem.
        </Alert>
      )}
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
  );
}
