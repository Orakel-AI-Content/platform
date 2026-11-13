import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { tabTo } from '../../../test/browser/a11y.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { toast } from '@/components/ui/toast';

import { ReviewChecks } from './ReviewChecks.tsx';
import { ReviewPanel } from './ReviewPanel.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Revisão em Chromium (workspace#87, ADR 0020 da raiz: só teclado e foco na composição): a seção
// de checagens não tem parada de Tab (o sistema marca, ninguém clica), e "Marcar todos" funciona
// pelo teclado, fica com o foco e leva direto às caixas e às aprovações. Cada caixa grava ao ser
// marcada pelo Espaço (#752), e o foco fica nela, inclusive quando a gravação falha. "Aprovar e
// publicar agora" e "Aprovar e agendar" (workspace#89) só com o teclado: o agendamento envia o
// instante em ISO da hora de parede de São Paulo escolhida no Dialog. Em passos (#766): "Próximo"
// leva de Checagens a Decisão só pelo teclado, grava `?passo=`, e o foco nunca cai no `body`.

const CHECKLIST = [
  { key: 'valor_original', label: 'Valor original' },
  { key: 'politicas_anuncios_afiliados', label: 'Políticas de anúncios e afiliados' },
  { key: 'visualizacao_conferida', label: 'Visualização conferida' },
];

afterEach(() => {
  navigation.set('/');
  toast.removeAll();
  vi.restoreAllMocks();
});

type Props = ComponentProps<typeof ReviewPanel>;

/** Painel em revisão, com o checklist já completo. */
const decisionPanel = (props: Partial<Props>) => (
  <ReviewPanel
    version={2}
    status="em_revisao"
    step="decisao"
    blocked={false}
    checklist={CHECKLIST}
    confirmed={CHECKLIST.map((item) => item.key)}
    canApprove
    confirm={vi.fn()}
    confirmAll={vi.fn()}
    approve={vi.fn()}
    approvePublish={vi.fn()}
    approveSchedule={vi.fn()}
    giveBack={vi.fn()}
    {...props}
  />
);

describe('Revisão no navegador', () => {
  it('pelo teclado: Próximo leva de Checagens a Decisão, grava ?passo= e não solta o foco', async () => {
    navigation.set('/sites/exemplo-a/revisao/7');
    const screen = await renderInApp(
      <>
        <button type="button">antes</button>
        {decisionPanel({ step: undefined })}
      </>,
    );
    const nextButton = screen.getByRole('button', { name: 'Próximo' });

    // Em Checagens, sem peça com parada de Tab, o primeiro Tab já é do rodapé ("Anterior" está
    // desabilitado).
    (screen.getByRole('button', { name: 'antes' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    await expect.element(nextButton).toHaveFocus();

    for (const step of ['ajustes', 'leitura']) {
      await userEvent.keyboard('{Enter}');
      expect(navigation.get()).toBe(`/sites/exemplo-a/revisao/7?passo=${step}`);
      await expect.element(nextButton).toHaveFocus();
    }
    // No último passo "Próximo" fica desabilitado, e o foco passa para "Anterior".
    await userEvent.keyboard('{Enter}');
    expect(navigation.get()).toBe('/sites/exemplo-a/revisao/7?passo=decisao');
    await expect.element(nextButton).toBeDisabled();
    await expect.element(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
    await expect.element(screen.getByRole('button', { name: 'Só aprovar' })).toBeVisible();
  });

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
          step="leitura"
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
          approvePublish={vi.fn()}
          approveSchedule={vi.fn()}
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
    // Depois das caixas, o rodapé: "Anterior" e "Próximo", que leva às aprovações.
    await userEvent.keyboard('{Tab}{Tab}{Tab}');
    await expect.element(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus();
    await userEvent.keyboard('{Tab}{Enter}');
    // Em Decisão, as três aprovações, com "Só aprovar" (o envio) por último.
    await tabTo(screen.getByRole('button', { name: 'Aprovar e agendar' }));
    await userEvent.keyboard('{Tab}{Tab}');
    await expect.element(screen.getByRole('button', { name: 'Só aprovar' })).toHaveFocus();
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
        step="leitura"
        blocked={false}
        checklist={CHECKLIST}
        confirmed={[]}
        canApprove
        confirm={confirm}
        confirmAll={vi.fn()}
        approve={vi.fn()}
        approvePublish={vi.fn()}
        approveSchedule={vi.fn()}
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

  it('pelo teclado: "Aprovar e publicar agora" decide e mostra o desfecho', async () => {
    const approvePublish = vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'Versão 2 aprovada: o artigo foi ao ar.' });
    const screen = await renderInApp(decisionPanel({ approvePublish }));

    await tabTo(screen.getByRole('button', { name: 'Aprovar e publicar agora' }));
    await userEvent.keyboard('{Enter}');

    await vi.waitFor(() => expect(approvePublish).toHaveBeenCalledWith());
    await expect
      .element(
        screen.getByRole('complementary').getByText('Versão 2 aprovada: o artigo foi ao ar.'),
      )
      .toBeVisible();
  });

  it('pelo teclado: "Aprovar e agendar" abre o Dialog e envia o instante escolhido em ISO', async () => {
    // Dois dias adiante, no calendário de São Paulo.
    const day = new Date(Date.now() + 2 * 86_400_000);
    const dayLabel = new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(day);
    const sameDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
    const ymd = sameDay.format(day);
    const approve = vi.fn();
    const approveSchedule = vi.fn().mockResolvedValue({
      ok: true,
      message: 'Versão 2 aprovada: o artigo foi agendado para o dia escolhido.',
    });
    const screen = await renderInApp(decisionPanel({ approve, approveSchedule }));

    await tabTo(screen.getByRole('button', { name: 'Aprovar e agendar' }));
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('dialog', { name: 'Agendar publicação' });
    await expect.element(dialog).toBeVisible();

    const field = dialog.getByRole('combobox', { name: 'Data e hora (horário de Brasília)' });
    await tabTo(field);
    await userEvent.keyboard('{Enter}');
    const picker = page.getByRole('dialog', { name: 'Escolher data e hora' });
    await expect.element(picker).toBeVisible();
    // Os dias têm uma parada de Tab só (roving tabindex); as setas levam ao dia escolhido.
    const days = [...picker.element().querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
    const tabbableDay = days.find((button) => button.tabIndex === 0);
    expect(tabbableDay).toBeDefined();
    await tabTo(tabbableDay!);
    for (let step = 0; step < 40; step += 1) {
      if (document.activeElement?.getAttribute('aria-label') === dayLabel) break;
      await userEvent.keyboard('{ArrowRight}');
    }
    expect(document.activeElement?.getAttribute('aria-label')).toBe(dayLabel);
    await userEvent.keyboard('{Enter}');
    // Escolhido o dia, o foco volta ao campo, com a hora de agora em São Paulo.
    await expect.element(field).toHaveFocus();

    await tabTo(dialog.getByRole('button', { name: 'Agendar' }));
    await userEvent.keyboard('{Enter}');

    // O instante sai em ISO e cai no dia escolhido em São Paulo; o envio do Dialog não envia
    // "Só aprovar".
    await vi.waitFor(() => expect(approveSchedule).toHaveBeenCalledOnce());
    const [iso] = approveSchedule.mock.calls[0] as [string];
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(sameDay.format(new Date(iso))).toBe(ymd);
    expect(approve).not.toHaveBeenCalled();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('complementary').getByText(/agendado para o dia escolhido/))
      .toBeVisible();
  });
});
