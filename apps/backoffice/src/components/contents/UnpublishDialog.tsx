'use client';

import { useRef, useState } from 'react';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import { Button } from '@/components/ui/Button';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Select from '@/components/ui/Select';

import { useContentAction } from './ContentActionScope.tsx';

// "Despublicar" do cabeçalho do conteúdo no ar (#494, workspace#20): o gatilho em contorno de
// erro abre o ConfirmDialog `danger` do Ecme, com o destino opcional do 301 num Select entre os
// outros conteúdos no ar do site (o próprio sai da lista; o domínio também o recusa). Sem destino, o texto avisa que o
// endereço passa a responder 404. A regra é do domínio (`unpublishContent`); o sucesso vai ao
// toast e a recusa ao Alert do `ContentActionScope`. Ao fechar, o foco volta ao gatilho, como na
// remoção de imagem do `PickerFields`. A página só monta o botão com content.publish e o
// conteúdo no ar.

export type UnpublishTarget = { id: number; title: string; slug: string };

type Option = { value: number; label: string };

export function UnpublishDialog({
  contentId,
  slug,
  targets,
  action,
}: {
  contentId: number;
  /** Slug da versão no ar, o endereço que sai do ar. */
  slug: string;
  /** Conteúdos no ar do site (`listLiveContents`), destinos possíveis do 301. */
  targets: readonly UnpublishTarget[];
  action: (to?: number) => Promise<ActionResult>;
}) {
  const scope = useContentAction('UnpublishDialog');
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<number | undefined>(undefined);

  const others = targets.filter((target) => target.id !== contentId);
  const options: Option[] = others.map((target) => ({
    value: target.id,
    label: `${target.title} (/${target.slug}/)`,
  }));
  const chosen = others.find((target) => target.id === to);

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        size="sm"
        customColorClass={dangerButtonClass}
        disabled={scope.pending}
        onClick={() => {
          setTo(undefined);
          setOpen(true);
        }}
      >
        {scope.pending ? 'Despublicando…' : 'Despublicar'}
      </Button>
      <ConfirmDialog
        isOpen={open}
        type="danger"
        title="Despublicar este conteúdo?"
        confirmText="Despublicar"
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          scope.run(() => action(to));
        }}
        onAfterClose={() => trigger.current?.focus()}
      >
        <p className="mb-4">
          {chosen === undefined
            ? `O conteúdo sai do site no próximo build, e /${slug}/ passa a responder 404.`
            : `O conteúdo sai do site no próximo build, e /${slug}/ passa a redirecionar (301) para /${chosen.slug}/.`}
        </p>
        <FormContainer>
          <FormItem
            label="Redirecionar para (opcional)"
            hint="Um conteúdo no ar deste site. Sem destino, o endereço responde 404."
            className="mb-0"
          >
            <Select<Option>
              options={options}
              value={options.find((option) => option.value === to) ?? null}
              onChange={(option) => setTo(option?.value)}
              isClearable
              placeholder="Sem destino"
              noOptionsMessage={() => 'Nenhum outro conteúdo no ar'}
            />
          </FormItem>
        </FormContainer>
      </ConfirmDialog>
    </>
  );
}
