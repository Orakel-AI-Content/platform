import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { renderInApp } from '../../../test/browser/render.tsx';
import { toast } from '@/components/ui/toast';

import { ReviewChecks } from './ReviewChecks.tsx';
import { ReviewPanel } from './ReviewPanel.tsx';

// Revisão em Chromium (workspace#87, ADR 0020 da raiz: só teclado e foco na composição): a seção
// de checagens não tem parada de Tab (o sistema marca, ninguém clica), e "Marcar todos" funciona
// pelo teclado, fica com o foco e leva direto às caixas e a "Aprovar".

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
          canApprove
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
    for (const item of CHECKLIST) {
      await expect.element(screen.getByRole('checkbox', { name: item.label })).toBeChecked();
    }

    await userEvent.keyboard('{Tab}');
    await expect.element(screen.getByRole('checkbox', { name: CHECKLIST[0]!.label })).toHaveFocus();
    await userEvent.keyboard('{Tab}{Tab}{Tab}');
    await expect.element(screen.getByRole('button', { name: 'Aprovar' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await vi.waitFor(() => expect(approve).toHaveBeenCalledWith(CHECKLIST.map((item) => item.key)));
  });
});
