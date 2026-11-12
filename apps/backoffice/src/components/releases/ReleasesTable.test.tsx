// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseRecord } from '@/domain/releases/releases.ts';

import { ReleasesTable } from './ReleasesTable.tsx';

// Registro de releases (#509): tag e data no fuso da operação, a mais recente primeiro; busca
// pela tag com o estado na URL (router.replace simulado); sem releases, o estado vazio. Estado
// da imagem e "Reconferir" (#574).

const navigation = vi.hoisted(() => {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: string) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/releases',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

// Releases cadastradas à mão: o estado do pipeline ainda não entra na tabela.
const manual = {
  pipelineState: 'disponivel',
  runId: null,
  runUrl: null,
  failureReason: null,
  requestedBy: null,
} as const;

const rows: ReleaseRecord[] = [
  {
    ...manual,
    tag: '1.10.0',
    registeredAt: new Date('2026-11-02T15:00Z'),
    imageStatus: 'disponivel',
    imageCheckedAt: new Date('2026-11-03T13:15Z'),
  },
  {
    ...manual,
    tag: '1.9.0',
    registeredAt: new Date('2026-10-20T12:30Z'),
    imageStatus: 'ausente',
    imageCheckedAt: new Date('2026-10-21T10:00Z'),
  },
  {
    ...manual,
    tag: '1.8.0',
    registeredAt: new Date('2026-10-01T12:00Z'),
    imageStatus: null,
    imageCheckedAt: null,
  },
];

const tags = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('ReleasesTable', () => {
  it('mostra tag e data no fuso da operação, a mais recente primeiro', () => {
    render(<ReleasesTable rows={rows} />);

    expect(tags()).toEqual(['1.10.0', '1.9.0', '1.8.0']);
    expect(screen.getByText(/02\/11\/2026.*12:00/)).toBeTruthy();
  });

  it('ordena pela tag em ordem numérica', async () => {
    render(<ReleasesTable rows={rows} />);

    await userEvent.click(screen.getByRole('button', { name: /Tag/ }));

    expect(tags()).toEqual(['1.8.0', '1.9.0', '1.10.0']);
  });

  it('busca pela tag', async () => {
    render(<ReleasesTable rows={rows} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar pela tag' }), '1.9');
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

    expect(tags()).toEqual(['1.9.0']);
  });

  it('mostra o estado da imagem de cada release, com a data da conferência quando houver', () => {
    render(<ReleasesTable rows={rows} />);

    const imageOf = (tag: string) => {
      const row = screen.getAllByRole('row').find((r) => r.textContent?.startsWith(tag));
      return within(row as HTMLElement).getAllByRole('cell')[2]?.textContent;
    };
    expect(screen.getByRole('columnheader', { name: 'Imagem' })).toBeTruthy();
    expect(imageOf('1.10.0')).toMatch(/^Imagem disponível.*Conferida em 03\/11\/2026.*10:15/);
    expect(imageOf('1.9.0')).toMatch(/^Imagem ausente.*Conferida em 21\/10\/2026.*07:00/);
    expect(imageOf('1.8.0')).toBe('Não conferida');
  });

  it('sem a action, não mostra "Reconferir"', () => {
    render(<ReleasesTable rows={rows} />);

    expect(screen.queryByRole('button', { name: /Reconferir/ })).toBeNull();
  });

  it('"Reconferir" chama a action com a tag da linha', async () => {
    const recheck = vi.fn().mockResolvedValue({ ok: true, message: 'Conferência enfileirada.' });
    render(<ReleasesTable rows={rows} recheck={recheck} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Reconferir a imagem da release 1.9.0' }),
    );

    expect(recheck).toHaveBeenCalledWith('1.9.0');
    expect(screen.queryByText('Sem permissão para release.promote')).toBeNull();
  });

  it('a recusa de "Reconferir" aparece no Alert, fora da linha', async () => {
    const recheck = vi
      .fn()
      .mockResolvedValue({ ok: false, message: 'Sem permissão para release.promote' });
    render(<ReleasesTable rows={rows} recheck={recheck} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Reconferir a imagem da release 1.10.0' }),
    );

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Sem permissão para release.promote',
    );
  });

  it('sem releases, o estado vazio com a ação', () => {
    render(
      <ReleasesTable rows={[]} emptyAction={<button type="button">Gerar nova versão</button>} />,
    );

    expect(screen.getByText('Nenhuma release registrada.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gerar nova versão' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
