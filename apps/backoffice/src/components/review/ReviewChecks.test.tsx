// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ReviewChecks } from './ReviewChecks.tsx';
import type { ReviewCheckItem } from './reviewCheckItems.ts';

// Seção de checagens automáticas da revisão (workspace#87): estado em texto, pendências com o
// onde, sem caixa de seleção.

afterEach(cleanup);

const items: ReviewCheckItem[] = [
  {
    key: 'imagens',
    label: 'Descrição das imagens ou marcação como decorativas',
    state: 'erro',
    findings: [{ message: 'Escreva o texto alternativo', where: 'Bloco 2' }],
  },
  {
    key: 'capa',
    label: 'Imagem de capa',
    state: 'aviso',
    findings: [{ message: 'O conteúdo não tem imagem de capa', where: 'Capa' }],
  },
  { key: 'categoria', label: 'Categoria', state: 'ok', findings: [] },
  { key: 'links_externos', label: 'Links externos respondem', state: 'verificando', findings: [] },
  {
    key: 'titulo_duplicado',
    label: 'Título diferente dos outros conteúdos do site',
    state: 'nao_verificado',
    findings: [{ message: 'Sem lugar', where: '' }],
  },
];

const itemRow = (label: string) => screen.getByText(label).closest('li') as HTMLElement;

describe('checagens automáticas', () => {
  it('seção com título próprio, um item por checagem e nenhuma caixa de seleção', () => {
    render(<ReviewChecks items={items} />);

    const section = screen.getByRole('region', { name: 'Checagens automáticas' });
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe(
      'Checagens automáticas',
    );
    for (const item of items) expect(within(section).getByText(item.label)).toBeTruthy();
    expect(within(section).queryByRole('checkbox')).toBeNull();
  });

  it('o estado de cada item vai em texto, inclusive verificando e não verificado', () => {
    render(<ReviewChecks items={items} />);

    expect(within(itemRow('Imagem de capa')).getByText('Aviso')).toBeTruthy();
    expect(within(itemRow('Categoria')).getByText('OK')).toBeTruthy();
    expect(within(itemRow('Links externos respondem')).getByText('Verificando')).toBeTruthy();
    expect(
      within(itemRow('Descrição das imagens ou marcação como decorativas')).getByText('Erro'),
    ).toBeTruthy();
    expect(
      within(itemRow('Título diferente dos outros conteúdos do site')).getByText('Não verificado'),
    ).toBeTruthy();
  });

  it('cada pendência mostra a mensagem e onde está', () => {
    render(<ReviewChecks items={items} />);

    const cover = within(itemRow('Imagem de capa')).getByText('O conteúdo não tem imagem de capa');
    expect(cover.textContent).toBe('Capa: O conteúdo não tem imagem de capa');
    const image = screen.getByText('Escreva o texto alternativo', { exact: false });
    expect(image.textContent).toBe('Bloco 2: Escreva o texto alternativo');
    // Sem lugar (o conteúdo todo), só a mensagem.
    expect(screen.getByText('Sem lugar').textContent).toBe('Sem lugar');
  });
});
