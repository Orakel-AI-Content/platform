// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Avatar } from '../Avatar/index.tsx';
import { Badge } from '../Badge/index.tsx';
import { Skeleton } from '../Skeleton/index.tsx';
import { Tag } from '../Tag/index.tsx';
import { Card } from './index.tsx';

// Componentes de exibição do Ecme (#206): props e renderização, com as adaptações de
// acessibilidade e contraste (Skeleton oculto, Badge e Avatar com as classes substitutas).

afterEach(cleanup);

describe('Card', () => {
  it('cabeçalho em texto vira h4, corpo e rodapé com as classes do Ecme; borda por padrão', () => {
    const { container } = render(
      <Card header={{ content: 'Resumo' }} footer={{ content: 'Rodapé' }} bodyClass="extra">
        Corpo
      </Card>,
    );

    expect(screen.getByRole('heading', { level: 4, name: 'Resumo' })).toBeTruthy();
    const card = container.firstElementChild!;
    expect(card.className).toContain('card');
    expect(card.className).toContain('card-border');
    expect(screen.getByText('Corpo').className).toContain('card-body extra');
    expect(screen.getByText('Rodapé').className).toContain('card-footer');
  });

  it('sem borda usa a sombra', () => {
    const { container } = render(<Card bordered={false}>Corpo</Card>);
    expect(container.firstElementChild!.className).toContain('card-shadow');
  });
});

describe('Badge', () => {
  it('sozinho, mostra o conteúdo, com texto escuro no tema escuro', () => {
    render(<Badge content={120} />);
    const badge = screen.getByText('120');
    expect(badge.className).toContain('bg-error');
    expect(badge.className).toContain('text-neutral');
    expect(badge.className).toContain('dark:text-gray-950');
    expect(badge.className).not.toContain('text-white');
  });

  it('sem conteúdo vira ponto; com filho, o selo fica por cima e respeita o máximo', () => {
    const { container } = render(<Badge />);
    expect(container.firstElementChild!.className).toContain('badge-dot');
    cleanup();

    render(
      <Badge content={120}>
        <span>Pendências</span>
      </Badge>,
    );
    // Sobre um filho, acima do máximo (99) vira "99+".
    const inner = screen.getByText('99+');
    expect(inner.className).toContain('badge-inner');
    expect(inner.parentElement?.textContent).toBe('99+Pendências');
  });
});

describe('Tag', () => {
  it('cores padrão do Ecme e ponto de prefixo com `prefix`', () => {
    const { container } = render(<Tag prefix>Publicado</Tag>);
    const tag = container.firstElementChild!;
    expect(tag.className).toContain('tag');
    expect(tag.className).toContain('text-gray-900');
    expect(tag.querySelector('.tag-prefix')).toBeTruthy();
  });
});

describe('Avatar', () => {
  it('com imagem, usa o alt; sem imagem, mostra as iniciais', () => {
    render(<Avatar src="/a.png" alt="Ana Souza" />);
    expect(screen.getByRole('img', { name: 'Ana Souza' }).getAttribute('src')).toBe('/a.png');
    cleanup();

    const { container } = render(<Avatar size="lg">AS</Avatar>);
    const avatar = container.firstElementChild!;
    expect(avatar.className).toContain('avatar avatar-circle avatar-lg');
    expect(screen.getByText('AS').className).toContain('avatar-string');
  });
});

describe('Skeleton', () => {
  it('fica fora da árvore de acessibilidade, nas variantes bloco e círculo', () => {
    const { container } = render(
      <>
        <Skeleton width="40%" />
        <Skeleton variant="circle" animation={false} />
      </>,
    );
    const [block, circle] = [...container.children];
    expect(block?.getAttribute('aria-hidden')).toBe('true');
    expect(block?.className).toContain('skeleton-block');
    expect(block?.className).toContain('animate-pulse');
    expect((block as HTMLElement).style.width).toBe('40%');
    expect(circle?.getAttribute('aria-hidden')).toBe('true');
    expect(circle?.className).toContain('skeleton-circle');
    expect(circle?.className).not.toContain('animate-pulse');
  });
});
