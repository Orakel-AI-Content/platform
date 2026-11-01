// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';

import { PublishActions, PublishActionsScope } from './PublishActions.tsx';

// Publicar, agendar e cancelar o agendamento (#492): os botões pelo status da versão mais
// recente, o retorno padrão (sucesso no toast, recusa no Alert do escopo) e o agendamento na
// hora de parede de São Paulo, com o processo em outro fuso.

const NOW = new Date('2026-11-04T11:00:00Z');
const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Lisbon';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = originalTz;
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
});

type Props = Parameters<typeof PublishActions>[0];

function actions(overrides: Partial<Props> = {}): Props {
  return {
    status: 'aprovado',
    scheduledAt: null,
    publish: vi.fn().mockResolvedValue({ ok: true, message: 'Publicado.' }),
    schedule: vi.fn().mockResolvedValue({ ok: true, message: 'Publicação agendada.' }),
    cancel: vi.fn().mockResolvedValue({ ok: true, message: 'Agendamento cancelado.' }),
    ...overrides,
  };
}

function Publish(props: Props) {
  return (
    <>
      <PublishActionsScope>
        <PublishActions {...props} />
      </PublishActionsScope>
      <ToastProvider />
    </>
  );
}

const button = (name: string) => screen.getByRole('button', { name });

describe('disponibilidade pelo status', () => {
  it('com aprovado, mostra Agendar e Publicar', () => {
    render(<Publish {...actions()} />);

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Agendar',
      'Publicar',
    ]);
  });

  it('com agendado, mostra o horário marcado em São Paulo e Cancelar agendamento', () => {
    render(
      <Publish
        {...actions({ status: 'agendado', scheduledAt: new Date('2026-11-05T13:00:00Z') })}
      />,
    );

    expect(screen.getByText(/^Agendado para 05\/11\/2026, 10:00/)).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Cancelar agendamento',
    ]);
  });

  it.each(['rascunho', 'em_revisao', 'publicado', 'despublicado'])(
    'com %s, não mostra ação e o Alert fica vazio',
    (status) => {
      render(<Publish {...actions({ status })} />);

      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByRole('alert').textContent).toBe('');
    },
  );

  it('fora do escopo, acusa o erro de montagem', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<PublishActions {...actions()} />)).toThrow(
      'PublishActions fora de um PublishActionsScope.',
    );
    vi.mocked(console.error).mockRestore();
  });
});

describe('publicar', () => {
  it('chama a action e anuncia o sucesso no toast', async () => {
    const props = actions();
    render(<Publish {...props} />);

    await userEvent.click(button('Publicar'));

    expect(props.publish).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Publicado.'));
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('a recusa do limite diário vai ao Alert e continua depois que a revalidação muda o status', async () => {
    const message = 'O site já publicou 3 conteúdos em 04/11/2026; o limite diário é 3';
    const props = actions({ publish: vi.fn().mockResolvedValue({ ok: false, message }) });
    const { rerender } = render(<Publish {...props} />);

    await userEvent.click(button('Publicar'));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message));
    expect(screen.getByRole('alert').querySelector('.alert')).toBeTruthy();
    rerender(<Publish {...props} status="publicado" />);
    expect(screen.getByRole('alert').textContent).toBe(message);
  });
});

describe('agendar', () => {
  it('a data e a hora escolhidas valem em São Paulo e saem em ISO', async () => {
    const props = actions();
    render(<Publish {...props} />);

    await userEvent.click(button('Agendar'));
    const dialog = screen.getByRole('dialog', { name: 'Agendar publicação' });
    expect((dialog.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.click(
      screen.getByRole('combobox', { name: 'Data e hora (horário de Brasília)' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '5 de novembro de 2026' }));
    await userEvent.click(screen.getByRole('textbox', { name: 'Hora' }));
    // O dia leva a hora de agora em São Paulo (08:00); digita só a hora.
    await userEvent.keyboard('10');
    await userEvent.click(button('OK'));
    await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => expect(props.schedule).toHaveBeenCalledOnce());
    // 10:00 em São Paulo (UTC-3) é 13:00 UTC, embora o processo esteja em Lisboa.
    expect(props.schedule).toHaveBeenCalledWith('2026-11-05T13:00:00.000Z');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Publicação agendada.'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Agendar publicação' })).toBeNull(),
    );
  });

  it('Cancelar fecha o Dialog sem agendar', async () => {
    const props = actions();
    render(<Publish {...props} />);

    await userEvent.click(button('Agendar'));
    await userEvent.click(button('Cancelar'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Agendar publicação' })).toBeNull(),
    );
    expect(props.schedule).not.toHaveBeenCalled();
  });
});

describe('cancelar o agendamento', () => {
  it('chama a action e anuncia o sucesso', async () => {
    const props = actions({ status: 'agendado', scheduledAt: new Date('2026-11-05T13:00:00Z') });
    render(<Publish {...props} />);

    await userEvent.click(button('Cancelar agendamento'));

    expect(props.cancel).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Agendamento cancelado.'),
    );
  });
});
