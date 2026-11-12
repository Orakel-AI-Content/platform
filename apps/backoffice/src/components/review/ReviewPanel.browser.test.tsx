import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { renderInApp } from '../../../test/browser/render.tsx';
import { toast } from '@/components/ui/toast';

import { ReviewChecks } from './ReviewChecks.tsx';
import { ReviewPanel } from './ReviewPanel.tsx';

// Revisão em Chromium (workspace#87, ADR 0020 da raiz: só teclado e foco na composição): a seção
// de checagens não tem parada de Tab (o sistema marca, ninguém clica), e "Marcar todos" funciona
// pelo teclado, fica com o foco e leva direto às caixas e a "Aprovar". Cada caixa grava ao ser
// marcada pelo Espaço (#752), e o foco fica nela, inclusive quando a gravação falha.

const CHECKLIST = [
  { key: 'valor_original', label: 'Valor original' },
  { key: 'politicas_anuncios_afiliados', label: 'Políticas de anúncios e afiliados' },
  { key: 'visualizacao_conferida', label: 'Visualização conferida' },
];

afterEach(() => {
  toast.removeAll();
  vi.restoreAllMocks();
});

describe('Revisão no navegador', () => {
  it('pelo teclado: a seção de checagens não prende o Tab; marcar todos e aprovar', async () => {
    const approve = vi.fn().mockResolvedValue({ ok: true, message: 'Versão 2 aprovada.' });
    const confirmAll = vi
      .fn()
      .mockResolvedValue({ ok: true, confirmed: CHECKLIST.map((item) => item.key) });
    const screen = await renderInApp(
      <>
        <button type="button">antes</button>
        <ReviewPanel
          version={2}
          status="em_revisao"
          checks={
            <ReviewChecks
              items={[
                {
                  key: 'capa',
                  label: 'Imagem de capa',
                  state: 'aviso',
                  findings: [{ message: 'O conteúdo não tem imagem de capa', where: 'Capa' }],
                },
                {
                  key: 'links_externos',
                  label: 'Links externos',
                  state: 'verificando',
                  findings: [],
                },
              ]}
            />
          }
          blocked={false}
          checklist={CHECKLIST}
          confirmed={[]}
          canApprove
          confirm={vi.fn()}
          confirmAll={confirmAll}
          approve={approve}
          giveBack={vi.fn()}
        />
      </>,
    );
    const markAll = screen.getByRole('button', { name: 'Marcar todos' });

    // Do botão antes do painel, o próximo Tab já é "Marcar todos": a seção não tem parada.
    (screen.getByRole('button', { name: 'antes' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    await expect.element(markAll).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await expect.element(markAll).toHaveFocus();
    expect(confirmAll).toHaveBeenCalledWith(true);
    for (const item of CHECKLIST) {
      await expect.element(screen.getByRole('checkbox', { name: item.label })).toBeChecked();
    }

    await userEvent.keyboard('{Tab}');
    await expect.element(screen.getByRole('checkbox', { name: CHECKLIST[0]!.label })).toHaveFocus();
    await userEvent.keyboard('{Tab}{Tab}{Tab}');
    await expect.element(screen.getByRole('button', { name: 'Aprovar' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await vi.waitFor(() => expect(approve).toHaveBeenCalledWith());
  });

  it('pelo teclado: o Espaço grava a caixa e o foco fica nela, também quando a gravação falha', async () => {
    const confirm = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, confirmed: ['valor_original'] })
      .mockResolvedValueOnce({ ok: false, message: 'Versão já decidida.' });
    const screen = await renderInApp(
      <ReviewPanel
        version={2}
        status="em_revisao"
        blocked={false}
        checklist={CHECKLIST}
        confirmed={[]}
        canApprove
        confirm={confirm}
        confirmAll={vi.fn()}
        approve={vi.fn()}
        giveBack={vi.fn()}
      />,
    );
    const first = screen.getByRole('checkbox', { name: CHECKLIST[0]!.label });
    const second = screen.getByRole('checkbox', { name: CHECKLIST[1]!.label });

    (first.element() as HTMLElement).focus();
    await userEvent.keyboard(' ');
    await expect.element(first).toBeChecked();
    await expect.element(first).toHaveFocus();
    expect(confirm).toHaveBeenLastCalledWith('valor_original', true);

    await userEvent.keyboard('{Tab} ');
    await expect.element(screen.getByText('Versão já decidida.')).toBeInTheDocument();
    await expect.element(second).not.toBeChecked();
    await expect.element(second).toHaveFocus();
  });
});
