import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent, type Locator } from 'vitest/browser';

import type { ReviewQueueEntry } from '@/domain/reviews/reviews.ts';

import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInApp } from '../../../test/browser/render.tsx';
import type { ApproveBatch } from './ApproveBatchDialog.tsx';
import { ReviewQueueTable } from './ReviewQueueTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Lote da fila de revisão em Chromium (#776): o fluxo inteiro pelo teclado, da caixa da linha
// ao resultado, com o foco preso no Dialog e devolvido ao fechar. Sem axe (ADR 0020 da raiz).

const SITE = 'exemplo-a';
const READ = 'Li os conteúdos selecionados e confirmo o checklist de cada um';

const entry = (id: number, title: string, batchBlockers: string[] = []): ReviewQueueEntry => ({
  id,
  kind: 'article',
  title,
  version: id + 1,
  submittedAt: new Date(`2026-11-0${String(id)}T12:00:00Z`),
  pending: batchBlockers.length,
  links: { state: 'sem_links' },
  returned: false,
  autoCorrected: false,
  opinion: 'favoravel',
  batchBlockers,
});

const ROWS = [entry(1, 'Limpo A'), entry(2, 'Com pendência', ['tem 1 pendência(s)'])];

const done: ApproveBatch = () =>
  Promise.resolve({ ok: true, items: [{ contentId: 1, outcome: 'published' }] });

function Queue({ action }: { action: ApproveBatch }) {
  return (
    <ListScreen title="Revisão">
      <ReviewQueueTable
        siteId={SITE}
        timeZone="America/Sao_Paulo"
        rows={ROWS}
        canPublish
        approveBatchAction={action}
        labelledBy="lista-titulo"
      />
    </ListScreen>
  );
}

/** Tab até `target` (com limite), como quem só usa o teclado. */
async function tabTo(target: Locator) {
  for (let step = 0; step < 60 && document.activeElement !== target.element(); step++) {
    await userEvent.keyboard('{Tab}');
  }
  expect(document.activeElement).toBe(target.element());
}

/** Marca a linha elegível com Espaço e abre o resumo com Enter no botão da barra. */
async function openSummary() {
  const box = page.getByRole('checkbox', { name: 'Selecionar Limpo A' });
  (box.element() as HTMLInputElement).focus();
  await userEvent.keyboard(' ');
  await expect.element(box).toBeChecked();
  const trigger = page.getByRole('button', { name: 'Aprovar e publicar selecionados' });
  await tabTo(trigger);
  await userEvent.keyboard('{Enter}');
  const dialog = page.getByRole('dialog', { name: 'Aprovar e publicar 1 conteúdo?' });
  await expect.element(dialog).toBeVisible();
  return { trigger, dialog };
}

beforeEach(() => {
  navigation.set(`/sites/${SITE}/revisao`);
});

afterEach(() => {
  navigation.set('/');
  vi.restoreAllMocks();
});

describe('lote da fila no navegador', () => {
  it('a linha fora do lote tem a caixa desabilitada, com o motivo', async () => {
    await renderInApp(<Queue action={done} />);
    const box = page.getByRole('checkbox', { name: 'Selecionar Com pendência' });

    await expect.element(box).toBeDisabled();
    await expect.element(box).toHaveAccessibleDescription('Fora do lote: tem 1 pendência(s).');
  });

  it('foco preso no resumo; Esc fecha sem enviar e devolve o foco ao gatilho', async () => {
    const warnings = appElementWarnings();
    const action = vi.fn(done);
    await renderInApp(<Queue action={action} />);

    const { trigger, dialog } = await openSummary();
    expect(appRoot().inert).toBe(true);
    await expectFocusTrapped(dialog);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    expect(appRoot().inert).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(warnings()).toEqual([]);
  });

  it('pelo teclado: confirma a leitura, envia, vê o resultado e o foco volta à lista', async () => {
    const action = vi.fn(done);
    await renderInApp(<Queue action={action} />);

    const { dialog } = await openSummary();
    const send = dialog.getByRole('button', { name: 'Aprovar e publicar' });
    await expect.element(send).toBeDisabled();
    await tabTo(dialog.getByRole('checkbox', { name: READ }));
    await userEvent.keyboard(' ');
    await expect.element(send).toBeEnabled();
    await tabTo(send);
    await userEvent.keyboard('{Enter}');

    const result = page.getByRole('dialog', { name: 'Resultado do lote' });
    await expect.element(result.getByRole('region', { name: 'Foram ao ar (1)' })).toBeVisible();
    expect(action).toHaveBeenCalledWith(SITE, [{ contentId: 1, version: 2 }]);
    await expectFocusTrapped(result);

    await tabTo(result.getByRole('button', { name: 'Concluir' }));
    await userEvent.keyboard('{Enter}');
    await expect.element(result).not.toBeInTheDocument();
    // A seleção zerou e a barra saiu: o foco vai ao título da lista, não se perde no body.
    await expect
      .element(page.getByRole('button', { name: 'Aprovar e publicar selecionados' }))
      .not.toBeInTheDocument();
    await expect.element(page.getByRole('heading', { name: 'Revisão' })).toHaveFocus();
  });
});
