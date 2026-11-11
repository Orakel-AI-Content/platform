import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { appElementWarnings, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { PageHeader } from '@/components/shared/PageHeader';
import { toast } from '@/components/ui/toast';

import { SiteOperations, SiteOperationsScope } from './SiteOperations.tsx';

// Ações de operação no cabeçalho da página do site em Chromium (#595): o "Mais ações" abre pelo
// teclado, o item abre o diálogo de hoje com o foco preso, e fechar devolve o foco ao gatilho
// do menu; sem violação do axe (WCAG 2.2 AA) com o menu e com o diálogo abertos, nos dois temas.

const RELEASES = [{ tag: '1.3.0', imageStatus: 'disponivel' as const }];
const VERSIONS = [
  {
    versionId: '20261010T120000Z-bbbbbbbb',
    release: '1.2.0',
    pages: 12,
    finishedAt: new Date('2026-10-10T12:00:00Z'),
  },
];
const ok = () => Promise.resolve({ ok: true as const, message: 'ok' });

function Header() {
  return (
    <main>
      <SiteOperationsScope>
        <PageHeader
          id="site-title"
          title="Exemplo A — Guias"
          action={
            <SiteOperations
              siteId="exemplo-a"
              paused={false}
              release="1.2.0"
              timeZone="America/Sao_Paulo"
              publish={ok}
              resume={ok}
              rebuild={{ releases: RELEASES, action: ok }}
              rollback={{ versions: VERSIONS, action: ok }}
            />
          }
        />
      </SiteOperationsScope>
    </main>
  );
}

const moreActions = () => page.getByRole('button', { name: 'Mais ações: exemplo-a' });

afterEach(() => {
  toast.removeAll();
  vi.restoreAllMocks();
});

describe('ações do site no navegador', () => {
  it('pelo teclado: o item abre o diálogo e Esc devolve o foco ao Mais ações', async () => {
    const warnings = appElementWarnings();
    await renderInApp(<Header />);

    (moreActions().element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const rebuild = page.getByRole('menuitem', { name: 'Reconstruir na release' });
    await expect.element(rebuild).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    const dialog = page.getByRole('alertdialog', { name: 'Reconstruir o site numa release?' });
    await expect.element(dialog).toBeVisible();
    await expectFocusTrapped(dialog);
    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(moreActions()).toHaveFocus();
    expect(warnings()).toEqual([]);
  });

  it('"Publicar agora" e o Mais ações em sm, na linha do título', async () => {
    await renderInApp(<Header />);
    const publish = page.getByRole('button', { name: 'Publicar agora exemplo-a' });
    const title = page.getByRole('heading', { name: 'Exemplo A — Guias' });
    const top = (locator: typeof publish) =>
      (locator.element() as HTMLElement).getBoundingClientRect();
    const titleBox = top(title);
    for (const control of [publish, moreActions()]) {
      const box = top(control);
      expect(box.bottom).toBeGreaterThan(titleBox.top);
      expect(box.top).toBeLessThan(titleBox.bottom);
      expect(box.height).toBe(40);
    }
  });
});

describe.each(COLOR_SCHEMES)('ações do site no navegador (%s)', (scheme) => {
  it('sem violação do axe com o menu e com o diálogo abertos', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInApp(<Header />);
    expect(await audit()).toEqual([]);

    await moreActions().click();
    await expect.element(page.getByRole('menu')).toBeVisible();
    expect(await audit()).toEqual([]);

    await page.getByRole('menuitem', { name: 'Reverter' }).click();
    const dialog = page.getByRole('alertdialog', {
      name: 'Reverter o site para uma versão anterior?',
    });
    await expect.element(dialog).toBeVisible();
    expect(await audit()).toEqual([]);
    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
