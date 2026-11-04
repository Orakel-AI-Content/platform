import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { EditorialContext } from '@/domain/generation/editorial-contexts.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInApp, renderInFrame } from '../../../test/browser/render.tsx';
import { EditorialContextForm } from './EditorialContextForm.tsx';
import { EditorialContextsTable } from './EditorialContextsTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Contextos editoriais em Chromium: a lista a 1280 px na moldura do admin, sem rolagem
// horizontal e com até duas linhas por célula mesmo com texto longo; o axe roda nos dois temas
// na lista e no formulário.

const SITE = 'exemplo-a';
const LONG = 'Público adulto interessado em finanças pessoais; tom direto e sem jargão. '.repeat(8);

const ROWS: EditorialContext[] = [
  {
    version: 2,
    body: LONG,
    createdBy: 'editor@orakel.local',
    createdAt: new Date('2026-11-02T12:00Z'),
  },
  {
    version: 1,
    body: 'Tom leve.',
    createdBy: 'admin@orakel.local',
    createdAt: new Date('2026-11-01T12:00Z'),
  },
];

function Contexts() {
  return (
    <ListScreen title="Contextos editoriais">
      <EditorialContextsTable timeZone="America/Sao_Paulo" rows={ROWS} labelledBy="lista-titulo" />
    </ListScreen>
  );
}

const table = () => page.getByRole('table', { name: 'Contextos editoriais', exact: true });

beforeEach(() => {
  navigation.set(`/sites/${SITE}/contextos`);
});

afterEach(() => {
  navigation.set('/');
});

describe('contextos editoriais no navegador', () => {
  it('a 1280 px, sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Contexts />, { roles: ['editor'] });
    await expect.element(table().getByRole('cell', { name: 'v2' })).toBeVisible();

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('lista sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Contexts />, { roles: ['editor'] });
    expect(await audit()).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('formulário sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInApp(
      <EditorialContextForm
        siteId={SITE}
        defaultBody="Tom leve."
        action={() => Promise.resolve({ ok: true, message: 'Salvo.' })}
      />,
    );
    expect(await audit()).toEqual([]);
  });
});
