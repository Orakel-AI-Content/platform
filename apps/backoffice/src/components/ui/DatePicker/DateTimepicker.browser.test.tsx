import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { audit, COLOR_SCHEMES, setTheme, tabTo } from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { FormContainer, FormItem } from '../Form';
import { DateTimepicker } from './index.tsx';
import { toZonedDate } from './utils/zonedDate.ts';

// DateTimepicker em Chromium (#457; da vitrine, #318): o site em Lisboa e o navegador em São
// Paulo (o fuso do `vitest.browser.config.ts`); o campo, o calendário e o horário mostram a
// hora de parede de Lisboa e o valor devolvido é o instante dela (ISO com o offset de Lisboa).
// Enter e Espaço abrem o painel, Esc fecha e devolve o foco ao campo.

const FUSO_DO_SITE = 'Europe/Lisbon';

/** 13:00 de 15/07/2026 em Lisboa (verão, UTC+1). */
const PUBLICACAO_INICIAL = new Date('2026-07-15T12:00:00Z');

/** Instante → ISO com o offset do fuso naquele instante, como o `IsoDateTimeSchema` grava. */
function isoNoFuso(date: Date | null, timeZone: string) {
  if (!date) return 'nenhum';
  const wall = toZonedDate(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  const seconds = Math.floor(date.getTime() / 1000) * 1000;
  const offset = Math.round(
    (Date.UTC(
      wall.getFullYear(),
      wall.getMonth(),
      wall.getDate(),
      wall.getHours(),
      wall.getMinutes(),
      wall.getSeconds(),
    ) -
      seconds) /
      60_000,
  );
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return (
    `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}` +
    `T${pad(wall.getHours())}:${pad(wall.getMinutes())}:${pad(wall.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function Pickers() {
  const [publicacao, setPublicacao] = useState<Date | null>(PUBLICACAO_INICIAL);
  return (
    <section aria-label="DateTimepicker">
      <FormContainer className="form-width">
        <FormItem label="Data de publicação">
          <DateTimepicker value={publicacao} timeZone={FUSO_DO_SITE} onChange={setPublicacao} />
        </FormItem>
        <FormItem label="Data bloqueada">
          <DateTimepicker disabled defaultValue={PUBLICACAO_INICIAL} timeZone={FUSO_DO_SITE} />
        </FormItem>
      </FormContainer>
      <p role="status">Valor devolvido: {isoNoFuso(publicacao, FUSO_DO_SITE)}.</p>
    </section>
  );
}

describe.each(COLOR_SCHEMES)('DateTimepicker no navegador (%s)', (scheme) => {
  it('pelo teclado, sem violação do axe com o painel aberto', async () => {
    await setTheme(scheme);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Sao_Paulo');
    const screen = await renderUi(<Pickers />);

    const status = screen.getByRole('status');
    const field = screen.getByRole('combobox', { name: 'Data de publicação' });
    const panel = page.getByRole('dialog', { name: 'Escolher data e hora' });
    await expect.element(field).toHaveValue('15/07/2026 13:00');
    await expect.element(status).toHaveTextContent('Valor devolvido: 2026-07-15T13:00:00+01:00.');
    await expect.element(screen.getByRole('combobox', { name: 'Data bloqueada' })).toBeDisabled();

    // Enter abre o painel com o foco nele; Esc fecha e devolve o foco ao campo.
    await tabTo(field);
    await userEvent.keyboard('{Enter}');
    await expect.element(panel).toBeVisible();
    await expect.element(field).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => panel.element().contains(document.activeElement)).toBe(true);
    await expect
      .element(panel.getByRole('button', { name: '15 de julho de 2026', pressed: true }))
      .toBeVisible();
    await expect.element(panel.getByRole('textbox', { name: 'Hora' })).toHaveValue('13');

    // Com o painel (no portal) aberto: a seção e o painel.
    expect(await audit(screen.container, panel)).toEqual([]);

    await userEvent.keyboard('{Escape}');
    await expect.element(panel).not.toBeInTheDocument();
    await expect.element(field).toHaveFocus();

    // Espaço também abre; o dia e a hora escolhidos voltam como hora de parede de Lisboa.
    await userEvent.keyboard(' ');
    await expect.element(panel).toBeVisible();
    await panel.getByRole('button', { name: '20 de julho de 2026' }).click();
    await expect.element(status).toHaveTextContent('Valor devolvido: 2026-07-20T13:00:00+01:00.');
    await panel.getByRole('textbox', { name: 'Hora' }).click();
    await userEvent.keyboard('0');
    await userEvent.keyboard('9');
    await expect.element(status).toHaveTextContent('Valor devolvido: 2026-07-20T09:00:00+01:00.');
    await panel.getByRole('button', { name: 'OK' }).click();
    await expect.element(panel).not.toBeInTheDocument();
    await expect.element(field).toHaveValue('20/07/2026 09:00');
    await expect.element(field).toHaveFocus();

    // Limpar pelo teclado.
    await tabTo(screen.getByRole('button', { name: 'Limpar data e hora' }));
    await userEvent.keyboard('{Enter}');
    await expect.element(field).toHaveValue('');
    await expect.element(status).toHaveTextContent('Valor devolvido: nenhum.');
  });
});
