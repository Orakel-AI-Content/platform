// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdaptiveCard from './AdaptiveCard.tsx';
import MediaSkeleton from './loaders/MediaSkeleton.tsx';
import TextBlockSkeleton from './loaders/TextBlockSkeleton.tsx';
import Loading from './Loading.tsx';
import StickyFooter from './StickyFooter.tsx';

// Componentes compartilhados do Ecme (#206): o Loading anuncia o carregamento, o
// AdaptiveCard fica no layout único e o StickyFooter não rola a página nem escreve no console.

afterEach(cleanup);

describe('Loading', () => {
  it('default: carregando, a área é um status com "Carregando…"; depois, mostra o conteúdo', () => {
    const { rerender } = render(<Loading loading>Conteúdo</Loading>);
    expect(screen.getByRole('status').textContent).toBe('Carregando…');
    expect(screen.queryByText('Conteúdo')).toBeNull();

    rerender(<Loading loading={false}>Conteúdo</Loading>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Conteúdo')).toBeTruthy();
  });

  it('cover: o conteúdo fica, com aria-busy e o status por cima', () => {
    const { container, rerender } = render(
      <Loading type="cover" loading>
        Conteúdo
      </Loading>,
    );
    expect(container.firstElementChild!.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Conteúdo')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Carregando…');

    rerender(
      <Loading type="cover" loading={false}>
        Conteúdo
      </Loading>,
    );
    expect(container.firstElementChild!.hasAttribute('aria-busy')).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('AdaptiveCard', () => {
  it('é o Card do layout único: mostra o conteúdo', () => {
    render(<AdaptiveCard bodyClass="extra">Corpo</AdaptiveCard>);
    expect(screen.getByText('Corpo')).toBeTruthy();
  });
});

describe('loaders', () => {
  it('MediaSkeleton e TextBlockSkeleton são feitos de Skeletons ocultos', () => {
    const { container } = render(
      <>
        <MediaSkeleton />
        <TextBlockSkeleton rowCount={2} />
      </>,
    );
    const skeletons = container.querySelectorAll('.skeleton');
    // Mídia: avatar, título e texto; bloco: título e 2 linhas.
    expect(skeletons).toHaveLength(6);
    for (const skeleton of skeletons) expect(skeleton.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('StickyFooter', () => {
  let observe: ((entries: { intersectionRatio: number }[]) => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { intersectionRatio: number }[]) => void) {
          observe = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fica sticky (com debounce) quando sai da vista; não rola a página nem escreve no console', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(
      <StickyFooter stickyClass="fixo" defaultClass="solto">
        {(isSticky) => (isSticky ? 'Preso' : 'Solto')}
      </StickyFooter>,
    );
    expect(screen.getByText('Solto')).toBeTruthy();

    act(() => observe?.([{ intersectionRatio: 0.5 }]));
    expect(screen.queryByText('Preso')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Preso')).toBeTruthy();

    act(() => {
      observe?.([{ intersectionRatio: 1 }]);
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Solto')).toBeTruthy();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
