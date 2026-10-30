import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { ContentListItem } from '@/domain/content/contents.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { ContentsTable } from './ContentsTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Lista de conteúdos cheia em Chromium (#460; antes no E2E, `contents.spec.ts`, #273): com 30
// conteúdos e a página de 25, a 1280 px, na moldura do admin, nada rola na horizontal e nenhuma
// célula passa de duas linhas de texto; o axe roda nos dois temas. Os títulos são os do seed do
// E2E (`Receita N`): com um título longo, a tabela passa da janela, um defeito que o E2E também
// não cobria (fica para uma issue própria, #460 não muda o visual).

const SITE = 'exemplo-a';
const STATUSES = ['rascunho', 'em_revisao', 'aprovado', 'agendado', 'publicado', 'despublicado'];

const ROWS: ContentListItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: 1000 + index,
  kind: index % 2 === 0 ? 'article' : 'page',
  title: `Receita ${index + 1}`,
  slug: `conteudo-${index + 1}`,
  status: STATUSES[index % STATUSES.length] as ContentListItem['status'],
  version: index + 1,
  updatedAt: new Date('2026-10-20T12:00Z'),
}));

function Contents() {
  return (
    <ListScreen title="Conteúdos">
      <ContentsTable
        siteId={SITE}
        timeZone="America/Sao_Paulo"
        rows={ROWS}
        canWrite
        labelledBy="lista-titulo"
      />
    </ListScreen>
  );
}

const table = () => page.getByRole('table', { name: 'Conteúdos', exact: true });

beforeEach(() => {
  navigation.set(`/sites/${SITE}/conteudos`);
});

afterEach(() => {
  navigation.set('/');
});

describe('ContentsTable no navegador', () => {
  it('cheia a 1280 px, sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Contents />);
    expect(table().element().querySelectorAll('tbody tr')).toHaveLength(25);

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Contents />);
    expect(await audit()).toEqual([]);
  });
});
