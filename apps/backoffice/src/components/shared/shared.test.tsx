// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGE_CONTAINER_GUTTER_X } from '../template/constants.ts';
import BottomStickyBar from '../template/BottomStickyBar.tsx';
import Table from '../ui/Table/index.tsx';

import AdaptiveCard from './AdaptiveCard.tsx';
import Container from './Container.tsx';
import EllipsisButton from './EllipsisButton.tsx';
import MediaSkeleton from './loaders/MediaSkeleton.tsx';
import TableRowSkeleton from './loaders/TableRowSkeleton.tsx';
import TextBlockSkeleton from './loaders/TextBlockSkeleton.tsx';
import Loading from './Loading.tsx';
import StickyFooter from './StickyFooter.tsx';

// Componentes compartilhados do Ecme (#206): o Loading anuncia o carregamento, o
// AdaptiveCard fica no layout único e o StickyFooter não rola a página nem escreve no console.
// EllipsisButton, Container e BottomStickyBar (#322): nome acessível, ícone oculto, elemento e
// barra sempre sticky nas bordas do `main`. TableRowSkeleton (#392): linhas × colunas ocultas.

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

  it('TableRowSkeleton: rows × columns células, avatar só nas colunas pedidas, tudo oculto', () => {
    const { container } = render(
      <Table>
        <TableRowSkeleton rows={3} columns={4} avatarInColumns={[0, 2]} />
      </Table>,
    );
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const cells = within(row).getAllByRole('cell');
      expect(cells).toHaveLength(4);
      cells.forEach((cell, col) => {
        const circles = cell.querySelectorAll('.skeleton-circle');
        expect(circles).toHaveLength(col === 0 || col === 2 ? 1 : 0);
      });
    }
    const skeletons = container.querySelectorAll('.skeleton');
    // 12 células com o bloco, mais o avatar em 2 colunas de 3 linhas.
    expect(skeletons).toHaveLength(18);
    for (const skeleton of skeletons) expect(skeleton.getAttribute('aria-hidden')).toBe('true');
  });

  it('TableRowSkeleton: padrão de 10 linhas e 1 coluna, sem avatar', () => {
    const { container } = render(
      <Table>
        <TableRowSkeleton />
      </Table>,
    );
    expect(screen.getAllByRole('row')).toHaveLength(10);
    expect(screen.getAllByRole('cell')).toHaveLength(10);
    expect(container.querySelectorAll('.skeleton-circle')).toHaveLength(0);
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

describe('EllipsisButton', () => {
  it('só ícone: o nome vem do aria-label e o ícone fica oculto; círculo plain xs, como no Ecme', () => {
    render(<EllipsisButton aria-label="Mais ações" />);
    const button = screen.getByRole('button', { name: 'Mais ações' });
    expect(button.textContent).toBe('');
    const icon = button.querySelector('svg')!;
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
    // `xs` só de ícone: 32×32 px (h-8 w-8), acima do alvo mínimo de 24 px.
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('w-8');
  });

  it('com texto: o nome é o texto visível e as props do Button chegam ao botão', () => {
    render(
      <EllipsisButton variant="default" shape="round" type="button">
        Opções
      </EllipsisButton>,
    );
    const button = screen.getByRole('button', { name: 'Opções' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).not.toContain('rounded-full');
  });

  it('sem aria-label nem texto, o tipo recusa o botão (nome acessível obrigatório)', () => {
    // @ts-expect-error -- só ícone, sem nome acessível.
    const unnamed = <EllipsisButton />;
    expect(unnamed).toBeTruthy();
  });
});

describe('Container', () => {
  it('é uma div centralizada por padrão, com a classe do chamador', () => {
    const { container } = render(<Container className="px-4">Conteúdo</Container>);
    const element = container.firstElementChild!;
    expect(element.tagName).toBe('DIV');
    expect(element.className).toBe('container mx-auto px-4');
    expect(element.textContent).toBe('Conteúdo');
  });

  it('asElement troca o elemento e o ref chega até ele', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Container asElement="section" ref={ref} aria-label="Área">
        Conteúdo
      </Container>,
    );
    expect(ref.current?.tagName).toBe('SECTION');
  });
});

describe('BottomStickyBar', () => {
  it('é sempre sticky no rodapé e a margem negativa espelha os gutters do main', () => {
    render(<BottomStickyBar>Ações</BottomStickyBar>);
    const bar = screen.getByText('Ações');
    const classes = bar.className.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['sticky', 'bottom-0', 'z-10']));
    expect(classes).not.toContain('fixed');
    const negative = PAGE_CONTAINER_GUTTER_X.split(' ').map((gutter) =>
      gutter.replace(/(^|:)px-/, '$1-mx-'),
    );
    expect(classes.filter((name) => /(^|:)-mx-/.test(name))).toEqual(negative);
  });
});
