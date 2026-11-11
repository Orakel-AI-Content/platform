import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { ContentListItem } from '@/domain/content/contents.ts';

import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { ContentsTable } from './ContentsTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Seleção da despublicação em massa (#495) em Chromium: caixas só nos conteúdos no ar e a barra
// dos selecionados, pelo teclado.

const SITE = 'exemplo-a';
const STATUSES = ['rascunho', 'em_revisao', 'aprovado', 'agendado', 'publicado', 'despublicado'];

const TITLE_41 = 'Como montar uma horta vertical na varanda';
const TOO_LONG =
  'Como montar uma horta vertical na varanda do apartamento em dez passos, com a lista de materiais, o substrato e a rega de cada espécie';

const ROWS: ContentListItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: 1000 + index,
  kind: index % 2 === 0 ? 'article' : 'page',
  title: index === 4 ? TITLE_41 : index === 5 ? TOO_LONG : `Receita ${index + 1}`,
  slug: `conteudo-${index + 1}`,
  status: STATUSES[index % STATUSES.length] as ContentListItem['status'],
  version: index + 1,
  updatedAt: new Date('2026-10-20T12:00Z'),
  live: index % 3 !== 0,
  authors: index === 5 ? ['Ana Souza', 'Bruno Lima', 'Carla Mendes Albuquerque'] : ['Ana Souza'],
  liveSlug: index % 3 !== 0 ? `conteudo-${index + 1}` : null,
}));

function Contents({ canPublish = false }: { canPublish?: boolean }) {
  return (
    <ListScreen title="Conteúdos">
      <ContentsTable
        siteId={SITE}
        timeZone="America/Sao_Paulo"
        rows={ROWS}
        canWrite
        canPublish={canPublish}
        unpublishAction={() => Promise.resolve({ ok: true, message: 'Despublicados.' })}
        labelledBy="lista-titulo"
        publicOrigin="https://horta-em-casa.com.br"
      />
    </ListScreen>
  );
}

beforeEach(() => {
  navigation.set(`/sites/${SITE}/conteudos`);
});

afterEach(() => {
  navigation.set('/');
});

describe('ContentsTable no navegador', () => {
  it('o teclado marca a caixa com Espaço, sem perder o foco, e chega à barra', async () => {
    await renderInFrame(<Contents canPublish />);
    const box = page.getByRole('checkbox', { name: 'Selecionar Receita 2' });
    (box.element() as HTMLInputElement).focus();

    await userEvent.keyboard(' ');
    await expect.element(box).toBeChecked();
    expect(document.activeElement).toBe(box.element());
    // A Receita 1 (índice 0) não está no ar: a caixa fica desabilitada, com o motivo (#587).
    await expect
      .element(page.getByRole('checkbox', { name: 'Selecionar Receita 1' }))
      .toBeDisabled();
    await expect
      .element(page.getByRole('checkbox', { name: 'Selecionar Receita 1' }))
      .toHaveAccessibleDescription('Só conteúdo no ar pode ser despublicado');

    const button = page.getByRole('button', { name: 'Despublicar em massa' });
    for (let step = 0; step < 120 && document.activeElement !== button.element(); step++) {
      await userEvent.keyboard('{Tab}');
    }
    expect(document.activeElement).toBe(button.element());
    await userEvent.keyboard('{Enter}');
    await expect
      .element(page.getByRole('alertdialog', { name: 'Despublicar 1 conteúdo?' }))
      .toBeVisible();
  });
});
