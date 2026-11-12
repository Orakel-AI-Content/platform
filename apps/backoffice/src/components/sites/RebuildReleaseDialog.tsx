'use client';

import { useState } from 'react';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, { dangerConfirmButtonProps } from '@/components/shared/ConfirmDialog.tsx';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Select from '@/components/ui/Select';

// "Escolher outra versão do motor" da etapa Versão (o "Reconstruir na release" de #515,
// workspace#21; renomeado em #691): o ConfirmDialog `danger` do Ecme com o Select das releases
// `disponivel`, no molde do `UnpublishDialog`. Começa na release atual do site, se está na lista,
// senão na mais recente, a cada abertura. Sem gatilho próprio (#595): quem abre (o
// `SiteOperationsScope`) guarda o estado, roda a action com a tag do `onConfirm` e devolve o foco
// no `onAfterClose`, como o `PublishNowDialog` (#586). A página só passa releases `disponivel`
// (#691), e a regra final é do domínio (`rebuildOnRelease` recusa as outras).

export type RebuildOnRelease = (tag: string) => Promise<ActionResult>;

/** Release `disponivel` que o site pode passar a usar. */
export type RebuildRelease = { tag: string };

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
  /** Releases `disponivel`, da mais recente para a mais antiga (`listReleases` filtrada). */
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
          ? 'Nenhuma release disponível: gere uma em Releases antes de reconstruir.'
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
            noOptionsMessage={() => 'Nenhuma release disponível'}
          />
        </FormItem>
      </FormContainer>
    </ConfirmDialog>
  );
}
