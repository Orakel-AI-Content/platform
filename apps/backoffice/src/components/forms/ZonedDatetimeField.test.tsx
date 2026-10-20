// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { SchemaForm } from './SchemaForm.tsx';
import { dateToIso, isoToDate, zonedDateTimeField } from './ZonedDatetimeField.tsx';
import { fieldLabel } from '@/test/fieldLabel.ts';

// Data de publicação no fuso do site (#183), no DateTimepicker do Ecme (#331): hora de parede ↔
// ISO com o offset do fuso. O processo roda em São Paulo (UTC-3, sem horário de verão) e o site
// em Lisboa, para o fuso do navegador nunca coincidir com o do site.

const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo';
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  process.env.TZ = originalTz;
  MotionGlobalConfig.skipAnimations = false;
});

afterEach(cleanup);

const at = (iso: string) => new Date(iso);

describe('conversão no fuso do site', () => {
  it('São Paulo: 06/10/2026 12:00 grava com -03:00', () => {
    expect(dateToIso(at('2026-10-06T15:00:00Z'), 'America/Sao_Paulo')).toBe(
      '2026-10-06T12:00:00-03:00',
    );
  });

  it('Lisboa: julho grava com +01:00 e dezembro com +00:00 (horário de verão)', () => {
    expect(dateToIso(at('2026-07-15T08:30:00Z'), 'Europe/Lisbon')).toBe(
      '2026-07-15T09:30:00+01:00',
    );
    expect(dateToIso(at('2026-12-15T09:30:00Z'), 'Europe/Lisbon')).toBe(
      '2026-12-15T09:30:00+00:00',
    );
  });

  it('ida e volta: o ISO gravado volta ao mesmo instante', () => {
    for (const [iso, timeZone] of [
      ['2026-10-06T12:00:00-03:00', 'America/Sao_Paulo'],
      ['2026-07-15T09:30:00+01:00', 'Europe/Lisbon'],
      ['2026-12-31T23:59:00+00:00', 'Europe/Lisbon'],
      ['2026-03-08T07:15:00-04:00', 'America/New_York'],
    ] as const) {
      expect(dateToIso(isoToDate(iso), timeZone)).toBe(iso);
    }
  });

  it('valor gravado com outro offset vira o mesmo instante com o offset do site', () => {
    expect(dateToIso(isoToDate('2026-10-06T15:00:00Z'), 'America/Sao_Paulo')).toBe(
      '2026-10-06T12:00:00-03:00',
    );
    expect(dateToIso(isoToDate('2026-07-15T12:00:00-03:00'), 'Europe/Lisbon')).toBe(
      '2026-07-15T16:00:00+01:00',
    );
  });

  it('grava o minuto cheio, sem os segundos do instante', () => {
    expect(dateToIso(at('2026-07-15T12:00:30.500Z'), 'Europe/Lisbon')).toBe(
      '2026-07-15T13:00:00+01:00',
    );
  });

  it('sem data: undefined na ida e null na volta', () => {
    expect(dateToIso(null, 'Europe/Lisbon')).toBeUndefined();
    expect(isoToDate('não é data')).toBeNull();
    expect(isoToDate(undefined)).toBeNull();
  });
});

describe('campo no gerador', () => {
  const schema = z.object({ publishedAt: z.iso.datetime({ offset: true }) });

  function renderField(value: string, onSubmit = vi.fn()) {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ publishedAt: value }}
        labels={{ publishedAt: 'Data de publicação' }}
        hints={{ publishedAt: 'Horário de Europe/Lisbon' }}
        fields={{ publishedAt: zonedDateTimeField('Europe/Lisbon') }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }

  const field = () => screen.getByRole('combobox', { name: fieldLabel('Data de publicação') });

  /** Abre o seletor, digita a hora (e o minuto) e confirma no OK. */
  async function pickTime(user: ReturnType<typeof userEvent.setup>, hours: string, minutes = '') {
    await user.click(field());
    await user.click(screen.getByRole('textbox', { name: 'Hora' }));
    await user.keyboard(hours);
    if (minutes !== '') {
      await user.click(screen.getByRole('textbox', { name: 'Minuto' }));
      await user.keyboard(minutes);
    }
    await user.click(screen.getByRole('button', { name: 'OK' }));
  }

  async function submitted(user: ReturnType<typeof userEvent.setup>, onSubmit: typeof vi.fn) {
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    return (onSubmit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { publishedAt: string };
  }

  it('é o DateTimepicker com a hora de parede do site, obrigatório e com a dica do fuso', () => {
    renderField('2026-07-15T12:00:00-03:00');

    expect(field()).toHaveProperty('value', '15/07/2026 16:00');
    expect(field().getAttribute('type')).not.toBe('datetime-local');
    expect(field().getAttribute('aria-required')).toBe('true');
    expect(field().getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(field().getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Horário de Europe/Lisbon');
  });

  it('sem mexer, o valor segue como veio', async () => {
    const user = userEvent.setup();
    const onSubmit = renderField('2026-07-15T12:00:30Z');

    expect((await submitted(user, onSubmit)).publishedAt).toBe('2026-07-15T12:00:30Z');
  });

  it('a hora escolhida grava ISO com o offset do site, no minuto cheio', async () => {
    const user = userEvent.setup();
    const summer = renderField('2026-07-15T12:00:30Z');
    await pickTime(user, '08', '45');
    expect((await submitted(user, summer)).publishedAt).toBe('2026-07-15T08:45:00+01:00');
    cleanup();

    const winter = renderField('2026-12-01T12:00:00Z');
    await pickTime(user, '08', '45');
    expect((await submitted(user, winter)).publishedAt).toBe('2026-12-01T08:45:00+00:00');
  });

  it('troca de horário: hora repetida é a primeira ocorrência; inexistente avança o salto', async () => {
    const user = userEvent.setup();
    // Lisboa, 25/10/2026: 02:00 de verão volta para 01:00, e 01:30 acontece duas vezes.
    const repeated = renderField('2026-10-24T23:30:00Z');
    await pickTime(user, '01');
    expect((await submitted(user, repeated)).publishedAt).toBe('2026-10-25T01:30:00+01:00');
    cleanup();

    // Lisboa, 29/03/2026: 01:00 pula para 02:00; 01:30 não existe e vira 02:30 de verão.
    const skipped = renderField('2026-03-29T00:30:00Z');
    await pickTime(user, '01');
    expect((await submitted(user, skipped)).publishedAt).toBe('2026-03-29T02:30:00+01:00');
  });

  it('a recusa do servidor leva o foco ao campo', async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ publishedAt: '2026-07-15T12:00:00Z' }}
        labels={{ publishedAt: 'Data de publicação' }}
        fields={{ publishedAt: zonedDateTimeField('Europe/Lisbon') }}
        submitLabel="Salvar"
        onSubmit={() => [{ path: ['publishedAt'], message: 'Data fora da janela' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect(field().getAttribute('aria-invalid')).toBe('true');
  });
});
