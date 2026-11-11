import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { EntityFormResult } from '@/components/editorial/EntityForms';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { toast } from '@/components/ui/toast';
import type { GenerationRunSummary } from '@/domain/generation/runs.ts';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { GenerationForm } from './GenerationForm.tsx';
import { GenerationRunsTable } from './GenerationRunsTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Aba Geração em Chromium, na moldura do admin a 1280 px: o disparo só pelo teclado (tema,
// autor no combobox, envio), o foco no campo recusado, a lista com as oito colunas sem rolagem
// horizontal e com até duas linhas por célula, e o axe nos dois temas.

const SITE = 'exemplo-a';

const ROWS: GenerationRunSummary[] = [
  {
    id: 3,
    createdAt: new Date('2026-11-03T12:00Z'),
    topic: 'Como escolher um moedor de café para o dia a dia sem gastar muito',
    status: 'pendente',
    provider: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    durationMs: null,
    contentId: null,
  },
  {
    id: 2,
    createdAt: new Date('2026-11-02T12:00Z'),
    topic: 'Café coado',
    status: 'ok',
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    inputTokens: 123_456,
    outputTokens: 4_567,
    costUsd: 0.123456,
    durationMs: 48_300,
    contentId: 1042,
  },
  {
    id: 1,
    createdAt: new Date('2026-11-01T12:00Z'),
    topic: 'Chá verde',
    status: 'falha',
    provider: 'openai',
    model: 'gpt-x',
    inputTokens: 10,
    outputTokens: 5,
    costUsd: null,
    durationMs: 850,
    contentId: null,
  },
];

const AUTHORS = [
  { id: 3, label: 'Ana Souza' },
  { id: 5, label: 'Bruno Lima' },
];

function Generation({ action }: { action: (value: unknown) => Promise<EntityFormResult> }) {
  return (
    <section aria-labelledby="generation-title" className="list-width space-y-4">
      <PageHeader id="generation-title" title="Geração" />
      <GenerationForm
        siteId={SITE}
        canWrite
        authors={AUTHORS}
        context={{ version: 4 }}
        action={action}
      />
      <AdaptiveCard>
        <section aria-labelledby="runs-title" className="flex flex-col gap-4">
          <h2 id="runs-title">Execuções</h2>
          <GenerationRunsTable
            siteId={SITE}
            timeZone="America/Sao_Paulo"
            rows={ROWS}
            hasContext
            labelledBy="runs-title"
          />
        </section>
      </AdaptiveCard>
    </section>
  );
}

const ok = () =>
  vi.fn(() => Promise.resolve<EntityFormResult>({ ok: true, message: 'Geração enfileirada.' }));

const table = () => page.getByRole('table', { name: 'Execuções', exact: true });

beforeEach(() => {
  navigation.set(`/sites/${SITE}/geracao`);
});

afterEach(() => {
  toast.removeAll();
  navigation.set('/');
});

describe('aba Geração no navegador', () => {
  it('a 1280 px, a lista sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Generation action={ok()} />, { roles: ['editor'] });
    await expect
      .element(table().getByRole('link', { name: 'Conteúdo #1042 (abrir)' }))
      .toBeVisible();

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it('dispara só pelo teclado: tema, autor no combobox e Enter no envio', async () => {
    const action = ok();
    await renderInFrame(<Generation action={action} />, { roles: ['editor'] });
    const topic = page.getByRole('textbox', { name: 'Tema ou palavra-chave' });
    const author = page.getByRole('combobox', { name: 'Autor' });

    await tabTo(topic);
    await userEvent.keyboard('Café coado');
    await userEvent.keyboard('{Tab}');
    await expect.element(author).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await tabTo(page.getByRole('button', { name: 'Gerar artigo' }));
    await userEvent.keyboard('{Enter}');

    await expect.poll(() => action.mock.calls.length).toBe(1);
    expect(action).toHaveBeenCalledWith({ topic: 'Café coado', authorId: 5 });
    // Aceito, o formulário volta ao vazio para o próximo tema.
    await expect.element(topic).toHaveValue('');
  });

  it('envio vazio leva o foco ao tema, com o erro na descrição', async () => {
    const action = ok();
    await renderInFrame(<Generation action={action} />, { roles: ['editor'] });
    const topic = page.getByRole('textbox', { name: 'Tema ou palavra-chave' });

    await tabTo(page.getByRole('button', { name: 'Gerar artigo' }));
    await userEvent.keyboard('{Enter}');

    await expect.element(topic).toHaveAttribute('aria-invalid', 'true');
    await expect.element(topic).toHaveFocus();
    await expect.element(topic).toHaveAccessibleDescription(/Escreva o tema do artigo/);
    expect(action).not.toHaveBeenCalled();
  });

  it.each(COLOR_SCHEMES)('formulário e lista sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Generation action={ok()} />, { roles: ['editor'] });
    await expect.element(table()).toBeVisible();
    expect(await audit()).toEqual([]);
  });

  it.each(COLOR_SCHEMES)(
    'aviso sem contexto editorial sem violação do axe (%s)',
    async (scheme) => {
      await setTheme(scheme);
      await setReducedMotion('reduce');
      await renderInFrame(
        <GenerationForm
          siteId={SITE}
          canWrite
          authors={AUTHORS}
          context={undefined}
          action={ok()}
        />,
        { roles: ['editor'] },
      );
      await expect
        .element(page.getByRole('main').getByRole('link', { name: 'Criar contexto editorial' }))
        .toBeVisible();
      expect(await audit()).toEqual([]);
    },
  );
});
