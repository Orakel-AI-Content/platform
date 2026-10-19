// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCreatedAnnouncement } from './useCreatedAnnouncement.ts';

// Anúncio de "criado" (#109): no quadro seguinte à montagem, tirando a marca da URL.

const replace = vi.hoisted(() => vi.fn<(url: string, options?: { scroll: boolean }) => void>());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sites/exemplo-a/conteudos/1/editar',
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe('useCreatedAnnouncement', () => {
  it('anuncia no quadro seguinte e tira a marca da URL sem rolar', async () => {
    const announce = vi.fn();
    renderHook(() => useCreatedAnnouncement('Conteúdo criado.', announce));
    expect(announce).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/sites/exemplo-a/conteudos/1/editar', {
      scroll: false,
    });
    await nextFrame();
    expect(announce).toHaveBeenCalledExactlyOnceWith('Conteúdo criado.');
  });

  it('sem a marca não anuncia nem mexe na URL', async () => {
    const announce = vi.fn();
    renderHook(() => useCreatedAnnouncement(undefined, announce));
    await nextFrame();
    expect(announce).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('desmontar antes do quadro cancela o anúncio', async () => {
    const announce = vi.fn();
    const { unmount } = renderHook(() => useCreatedAnnouncement('Site x cadastrado.', announce));
    unmount();
    await nextFrame();
    expect(announce).not.toHaveBeenCalled();
  });
});
