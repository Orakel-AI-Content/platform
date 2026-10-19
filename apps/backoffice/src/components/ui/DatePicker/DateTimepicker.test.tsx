// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FormItem } from '../Form';
import { DateTimepicker } from './index.tsx';

// DateTimepicker do Ecme (#318) com a prop `timeZone`: o campo, o calendário e o horário mostram
// a hora de parede do site (Lisboa), e o `onChange` recebe o instante dela. O processo roda em
// São Paulo (UTC-3, sem horário de verão), para o fuso do navegador nunca coincidir com o do
// site.

const NOW = new Date('2026-10-19T20:00:00Z');
const LISBOA = 'Europe/Lisbon';
const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  // A mensagem do FormItem entra sem animação no happy-dom (como no TimeInput.test).
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = originalTz;
  MotionGlobalConfig.skipAnimations = false;
});

afterEach(cleanup);

const field = () => screen.getByRole('combobox', { name: 'Publicação' });
const panel = () => screen.queryByRole('dialog', { name: 'Escolher data e hora' });
const lastIso = (onChange: ReturnType<typeof vi.fn>) =>
  (onChange.mock.lastCall?.[0] as Date | null)?.toISOString();

function renderPicker(props: Parameters<typeof DateTimepicker>[0]) {
  return render(
    <FormItem label="Publicação">
      <DateTimepicker {...props} />
    </FormItem>,
  );
}

/** Abre o painel e digita a hora no TimeInput dele. */
async function typeHours(hours: string) {
  await userEvent.click(field());
  await userEvent.click(screen.getByRole('textbox', { name: 'Hora' }));
  await userEvent.keyboard(hours);
}

describe('DateTimepicker', () => {
  it('confere o fuso do processo do teste', () => {
    expect(NOW.getHours()).toBe(17);
  });

  it('com timeZone, o campo mostra a hora de parede do site em pt-BR, 24 h', () => {
    // 12:00 UTC de 15/07 são 13:00 em Lisboa (verão, UTC+1) e 09:00 em São Paulo.
    renderPicker({ value: new Date('2026-07-15T12:00:00Z'), timeZone: LISBOA });

    expect(field()).toHaveProperty('value', '15/07/2026 13:00');
  });

  it('sem timeZone, o campo mostra a hora do fuso do processo, como no Ecme', () => {
    renderPicker({ value: new Date('2026-07-15T12:00:00Z') });

    expect(field()).toHaveProperty('value', '15/07/2026 09:00');
  });

  it('o painel mostra o dia e a hora de Lisboa, em 24 h, sem período', async () => {
    // 23:30 UTC de 15/07 já são 00:30 de 16/07 em Lisboa.
    renderPicker({ defaultValue: new Date('2026-07-15T23:30:00Z'), timeZone: LISBOA });

    await userEvent.click(field());

    expect(panel()).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '16 de julho de 2026', pressed: true }),
    ).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Hora' })).toHaveProperty('value', '00');
    expect(screen.getByRole('textbox', { name: 'Minuto' })).toHaveProperty('value', '30');
    expect(screen.queryByRole('textbox', { name: 'Período' })).toBeNull();
  });

  it('o dia escolhido volta como o instante daquele dia em Lisboa, com a hora do valor', async () => {
    const onChange = vi.fn();
    renderPicker({
      defaultValue: new Date('2026-07-15T12:00:00Z'),
      timeZone: LISBOA,
      onChange,
    });

    await userEvent.click(field());
    await userEvent.click(screen.getByRole('button', { name: '20 de julho de 2026' }));

    expect(lastIso(onChange)).toBe('2026-07-20T12:00:00.000Z');
    expect(field()).toHaveProperty('value', '20/07/2026 13:00');
  });

  it('sem valor, o dia escolhido leva a hora de agora em Lisboa', async () => {
    const onChange = vi.fn();
    renderPicker({ timeZone: LISBOA, onChange });

    // Agora são 21:00 de 19/10 em Lisboa (UTC+1).
    await userEvent.click(field());
    await userEvent.click(screen.getByRole('button', { name: '20 de outubro de 2026' }));

    expect(lastIso(onChange)).toBe('2026-10-20T20:00:00.000Z');
  });

  it('a hora digitada é a de parede em Lisboa e o OK fecha o painel', async () => {
    const onChange = vi.fn();
    renderPicker({
      defaultValue: new Date('2026-07-15T12:00:00Z'),
      timeZone: LISBOA,
      onChange,
    });

    await typeHours('18');
    expect(lastIso(onChange)).toBe('2026-07-15T17:00:00.000Z');

    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(panel()).toBeNull();
    expect(field()).toHaveProperty('value', '15/07/2026 18:00');
    expect(lastIso(onChange)).toBe('2026-07-15T17:00:00.000Z');
  });

  it('valor controlado: o onChange recebe o instante e o campo segue a prop', async () => {
    const onChange = vi.fn();
    const { rerender } = renderPicker({
      value: new Date('2026-12-15T09:30:00Z'),
      timeZone: LISBOA,
      onChange,
    });

    await typeHours('11');
    // Inverno em Lisboa: UTC+0.
    expect(lastIso(onChange)).toBe('2026-12-15T11:30:00.000Z');

    rerender(
      <FormItem label="Publicação">
        <DateTimepicker value={onChange.mock.lastCall?.[0] as Date} timeZone={LISBOA} />
      </FormItem>,
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(field()).toHaveProperty('value', '15/12/2026 11:30'));
  });

  describe('troca de horário de Lisboa', () => {
    it('hora inexistente (29/03, 01:00 → 02:00): 01:30 avança para 02:30 de verão', async () => {
      const onChange = vi.fn();
      // 00:30 de 29/03 em Lisboa (inverno, UTC+0).
      renderPicker({
        defaultValue: new Date('2026-03-29T00:30:00Z'),
        timeZone: LISBOA,
        onChange,
      });

      await typeHours('01');

      expect(lastIso(onChange)).toBe('2026-03-29T01:30:00.000Z');
      await userEvent.click(screen.getByRole('button', { name: 'OK' }));
      expect(field()).toHaveProperty('value', '29/03/2026 02:30');
    });

    it('hora repetida (25/10, 02:00 → 01:00): 01:30 é a primeira ocorrência, de verão', async () => {
      const onChange = vi.fn();
      // 00:30 de 25/10 em Lisboa (verão, UTC+1).
      renderPicker({
        defaultValue: new Date('2026-10-24T23:30:00Z'),
        timeZone: LISBOA,
        onChange,
      });

      await typeHours('01');

      expect(lastIso(onChange)).toBe('2026-10-25T00:30:00.000Z');
      await userEvent.click(screen.getByRole('button', { name: 'OK' }));
      expect(field()).toHaveProperty('value', '25/10/2026 01:30');
    });
  });

  describe('teclado e acessibilidade', () => {
    it('o campo leva o rótulo do FormItem e anuncia o painel', () => {
      renderPicker({ timeZone: LISBOA });

      expect(field().getAttribute('aria-haspopup')).toBe('dialog');
      expect(field().getAttribute('aria-expanded')).toBe('false');
      expect(field()).toHaveProperty('readOnly', true);
    });

    for (const key of ['{Enter}', ' '] as const) {
      it(`${key === ' ' ? 'Espaço' : 'Enter'} abre o painel com o foco nele; Esc fecha e devolve o foco ao campo`, async () => {
        renderPicker({ defaultValue: new Date('2026-07-15T12:00:00Z'), timeZone: LISBOA });

        await userEvent.tab();
        expect(document.activeElement).toBe(field());
        await userEvent.keyboard(key);

        const dialog = panel();
        expect(dialog).not.toBeNull();
        expect(field().getAttribute('aria-expanded')).toBe('true');
        await waitFor(() => expect(dialog?.contains(document.activeElement)).toBe(true));

        await userEvent.keyboard('{Escape}');
        expect(panel()).toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(field()));
      });
    }

    it('o TimeInput do painel não repete o id do campo', async () => {
      renderPicker({ defaultValue: new Date('2026-07-15T12:00:00Z'), timeZone: LISBOA });

      await userEvent.click(field());

      const hours = screen.getByRole('textbox', { name: 'Hora' });
      expect(hours.id).not.toBe(field().id);
    });

    it('limpar: botão "Limpar data e hora" esvazia o campo e devolve null', async () => {
      const onChange = vi.fn();
      renderPicker({
        defaultValue: new Date('2026-07-15T12:00:00Z'),
        timeZone: LISBOA,
        onChange,
      });

      await userEvent.click(screen.getByRole('button', { name: 'Limpar data e hora' }));

      expect(field()).toHaveProperty('value', '');
      expect(onChange.mock.lastCall?.[0]).toBeNull();
    });
  });
});
