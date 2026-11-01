import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { PageHeader } from '@/components/shared/PageHeader';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { PublishActions, PublishActionsScope } from './PublishActions.tsx';

// Ações de publicação no cabeçalho do conteúdo em Chromium (#492): o axe (WCAG 2.2 AA) nos dois
// temas com a versão aprovada e a recusa do limite diário no Alert, com a versão agendada e o
// horário marcado, e com o Dialog do agendamento e o painel do DateTimepicker abertos.

const LIMIT = 'O site já publicou 3 conteúdos em 04/11/2026; o limite diário é 3';

function Header({ status, scheduledAt = null }: { status: string; scheduledAt?: Date | null }) {
  return (
    <section aria-labelledby="content-title">
      <PublishActionsScope>
        <PageHeader
          id="content-title"
          title="Guia de receitas regionais"
          action={
            <PublishActions
              status={status}
              scheduledAt={scheduledAt}
              publish={vi.fn().mockResolvedValue({ ok: false, message: LIMIT })}
              schedule={vi.fn().mockResolvedValue({ ok: true, message: 'Publicação agendada.' })}
              cancel={vi.fn().mockResolvedValue({ ok: true, message: 'Agendamento cancelado.' })}
            />
          }
        />
      </PublishActionsScope>
    </section>
  );
}

describe('ações de publicação no navegador', () => {
  it.each(COLOR_SCHEMES)(
    'aprovada, com a recusa no Alert: sem violação do axe (%s)',
    async (scheme) => {
      await setTheme(scheme);
      await setReducedMotion('reduce');
      const screen = await renderInApp(<Header status="aprovado" />);

      await screen.getByRole('button', { name: 'Publicar' }).click();
      await expect.element(screen.getByRole('alert')).toHaveTextContent(LIMIT);

      expect(await audit()).toEqual([]);
    },
  );

  it.each(COLOR_SCHEMES)('agendada, com o horário: sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(
      <Header status="agendado" scheduledAt={new Date('2026-11-05T13:00:00Z')} />,
    );

    await expect.element(screen.getByText(/^Agendado para 05\/11\/2026, 10:00/)).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Cancelar agendamento' }))
      .toBeVisible();

    expect(await audit()).toEqual([]);
  });

  it.each(COLOR_SCHEMES)(
    'Dialog do agendamento com o painel aberto: sem violação do axe (%s)',
    async (scheme) => {
      await setTheme(scheme);
      await setReducedMotion('reduce');
      const screen = await renderInApp(<Header status="aprovado" />);

      await screen.getByRole('button', { name: 'Agendar' }).click();
      const dialog = page.getByRole('dialog', { name: 'Agendar publicação' });
      await expect.element(dialog).toBeVisible();
      await userEvent.click(
        dialog.getByRole('combobox', { name: 'Data e hora (horário de Brasília)' }),
      );
      await expect
        .element(page.getByRole('dialog', { name: 'Escolher data e hora' }))
        .toBeVisible();

      expect(await audit()).toEqual([]);
    },
  );
});
