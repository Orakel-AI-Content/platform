import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { PageHeader } from '@/components/shared/PageHeader';
import { toast } from '@/components/ui/toast';

import { SiteOperations, SiteOperationsScope } from './SiteOperations.tsx';

// Ações de operação no cabeçalho da página do site em Chromium (#595): o "Mais ações" abre pelo
// teclado, o item abre o diálogo de hoje com o foco preso, e fechar devolve o foco ao gatilho
// do menu.

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
});
