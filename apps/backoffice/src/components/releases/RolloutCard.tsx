'use client';

import { useState, useTransition } from 'react';
import { TbRefresh } from 'react-icons/tb';

import { ActionAlert, pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog from '@/components/shared/ConfirmDialog.tsx';
import type { StateTagColor } from '@/components/shared/siteLabels.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import { Button } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import type {
  Rollout,
  RolloutSite,
  RolloutSiteState,
  RolloutState,
} from '@/domain/releases/rollout.ts';

// "Atualizar todos os sites" em /releases (#703, workspace#83): o botão do cabeçalho, que pede
// confirmação com a versão de destino, e o cartão de progresso da última atualização, no esboço
// aprovado no refinamento. A regra é do domínio (`startRollout`): a recusa fica no Alert do
// diálogo, como no `NewReleaseDialog`, e o sucesso vai ao toast. O polling é da tela
// (`useReleasesSnapshot`).

export type StartRollout = () => Promise<ActionResult>;

const ROLLOUT_STATE_LABEL: Record<RolloutState, string> = {
  em_andamento: 'em andamento',
  concluida: 'concluída',
  falhou: 'falhou',
  interrompida: 'interrompida',
};

/** Estados de um site que aparecem na lista; `nao_atualizado` vai à linha dos pausados. */
type ListedState = Exclude<RolloutSiteState, 'nao_atualizado'>;

const SITE_STATE_LABEL: Record<ListedState, string> = {
  aguardando: 'Aguardando',
  em_andamento: 'Em andamento',
  atualizado: 'Atualizado',
  falhou: 'Falhou',
};

const SITE_STATE_COLOR: Record<ListedState, StateTagColor> = {
  aguardando: 'bg-gray-400',
  em_andamento: 'bg-info',
  atualizado: 'bg-success',
  falhou: 'bg-error',
};

const REACHED: ReadonlySet<RolloutSiteState> = new Set(['atualizado', 'em_andamento', 'falhou']);

const isListed = (site: RolloutSite): site is RolloutSite & { state: ListedState } =>
  site.state !== 'nao_atualizado';

/**
 * "N de M": N são os sites alcançados (atualizado, em andamento ou falhou), M os que não ficaram
 * de fora (pausados). No esboço, 2 atualizados e 1 em andamento de 8 dão "3 de 8".
 */
export function rolloutProgress(rollout: Rollout): { reached: number; total: number } {
  const listed = rollout.sites.filter(isListed);
  return {
    reached: listed.filter((site) => REACHED.has(site.state)).length,
    total: listed.length,
  };
}

/**
 * O primeiro site, na ordem, que a atualização de fato promoveu: fora dos pausados e numa versão
 * diferente do destino no início (quem já estava nela entra atualizado, sem build). `undefined`
 * quando nenhum foi promovido.
 */
export function firstSiteId(rollout: Rollout): string | undefined {
  return rollout.sites.find(
    (site) => isListed(site) && site.previousRelease !== rollout.targetRelease,
  )?.siteId;
}

/**
 * "Atualizar todos os sites": desabilitado sem release `disponivel` (`target` nulo) ou com uma
 * atualização em andamento. Confirmado, chama a action; a recusa do domínio fica no diálogo.
 */
export function RolloutButton({
  target,
  running,
  action,
}: {
  /** Versão de destino (a `disponivel` mais recente); `null` sem nenhuma. */
  target: string | null;
  /** Há uma atualização em andamento. */
  running: boolean;
  action: StartRollout;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    if (!pending) setOpen(false);
  };
  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await action();
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
        aria-haspopup="dialog"
        disabled={target === null || running}
        icon={<TbRefresh className="text-xl" aria-hidden />}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Atualizar todos os sites
      </Button>
      <ConfirmDialog
        isOpen={open}
        type="warning"
        title={`Atualizar todos os sites para a ${target ?? ''}?`}
        confirmText={pending ? 'Iniciando…' : 'Atualizar'}
        confirmButtonProps={{ loading: pending }}
        cancelButtonProps={{ disabled: pending }}
        onCancel={close}
        onConfirm={confirm}
      >
        <p>
          A versão <span className="font-semibold tabular-nums">{target}</span> vai aos sites um por
          vez, começando pelo de menor audiência. Se um site falhar, a atualização para e os
          restantes continuam na versão em que estão. Sites pausados ficam de fora.
        </p>
        <ActionAlert error={error} className="mt-4" />
      </ConfirmDialog>
    </>
  );
}

/**
 * Cartão de progresso da última atualização: versão, estado e "N de M"; cada site na ordem com o
 * seu estado, o primeiro marcado; os pausados numa linha à parte, como não atualizados. O resumo
 * fica num `role="status"`, para o leitor de tela anunciar o avanço que o polling traz.
 */
export function RolloutCard({ rollout }: { rollout: Rollout }) {
  const { reached, total } = rolloutProgress(rollout);
  const first = firstSiteId(rollout);
  const listed = rollout.sites.filter(isListed);
  const skipped = rollout.sites.filter((site) => !isListed(site));
  return (
    <Card bodyClass="space-y-3">
      <div role="status" aria-label="Progresso da atualização">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
          Atualização para <span className="tabular-nums">{rollout.targetRelease}</span> ·{' '}
          {ROLLOUT_STATE_LABEL[rollout.state]} ·{' '}
          <span className="tabular-nums">
            {reached} de {total}
          </span>
        </h2>
      </div>
      {listed.length > 0 && (
        <ul aria-label="Sites da atualização" className="space-y-2 text-sm">
          {listed.map((site) => (
            <li key={site.siteId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-gray-900 wrap-anywhere dark:text-gray-100">
                {site.siteId}
                {site.siteId === first && <span className="font-normal"> (primeiro)</span>}
              </span>
              <StateTag color={SITE_STATE_COLOR[site.state]}>
                {SITE_STATE_LABEL[site.state]}
              </StateTag>
            </li>
          ))}
        </ul>
      )}
      {skipped.length > 0 && (
        <p className="text-sm">
          Não atualizados (pausados): {skipped.map((site) => site.siteId).join(', ')}
        </p>
      )}
    </Card>
  );
}
