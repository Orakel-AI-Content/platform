// @vitest-environment happy-dom
import { RESOURCES, SiteConfigSchema, type SiteConfig } from '@orakel/content-model/v1';
import { THEME_IDS, THEME_SUMMARIES } from '@orakel/tokens';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';

import { editValues } from './siteConfigFormValues.ts';
import type { SiteFormResult } from './siteConfigFormValues.ts';
import { SITE_CONFIG_HIDDEN, SITE_CONFIG_SECTIONS, SiteConfigForm } from './SiteConfigForm.tsx';
import { fieldLabel } from '@/test/fieldLabel.ts';

// Formulário da configuração do site no gerador (#47): ida e volta da SiteConfig, SITE_ID só
// leitura na edição e recusa do domínio no campo, com foco.

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// A mensagem de erro do FormItem (#245) anima com o motion, que o happy-dom cancela no `cleanup`.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
  vi.clearAllMocks();
});

const config: SiteConfig = {
  siteId: 'exemplo-c',
  name: 'Exemplo C',
  domains: ['c.example.com', 'www.c.example.com'],
  language: 'pt-BR',
  timeZone: 'America/Sao_Paulo',
  indexavel: false,
  theme: 'exemplo-a',
  presets: { home: 'revista', artigo: 'padrao', categoria: 'padrao', autor: 'padrao' },
  variants: { articleCard: 'horizontal' },
  featureFlags: { busca: true, comentarios: false },
  crawlers: { block: ['GPTBot'] },
  integrations: { ga4: { enabled: true, measurementId: 'G-ABC123' } },
};

const options = {
  presets: RESOURCES.presets,
  variants: RESOURCES.variants,
  themes: THEME_SUMMARIES,
};

function renderForm(mode: 'create' | 'edit', result: SiteFormResult | Promise<SiteFormResult>) {
  const action = vi.fn<(value: SiteConfig) => Promise<SiteFormResult>>(() =>
    Promise.resolve(result),
  );
  render(
    <SiteConfigForm
      mode={mode}
      defaultValues={editValues({ ...config, institutionalTexts: { about: [] } })}
      options={options}
      action={action}
      backHref={mode === 'create' ? '/sites' : '/sites/exemplo-a'}
      contentClassName="form-width"
    />,
  );
  return action;
}

const renderEdit = (result: SiteFormResult) => renderForm('edit', result);

/** Resposta da action que só chega quando o teste chamar `finish`. */
function deferred() {
  let finish: (result: SiteFormResult) => void = () => undefined;
  const promise = new Promise<SiteFormResult>((resolve) => {
    finish = resolve;
  });
  return { promise, finish: (result: SiteFormResult) => finish(result) };
}

describe('formulário da configuração do site', () => {
  it('salvar sem mudar envia a mesma configuração, sem os textos institucionais', async () => {
    const user = userEvent.setup();
    const action = renderEdit({ ok: true, message: 'Configuração salva (versão 2).' });
    render(<ToastProvider />);

    expect(screen.getByLabelText(fieldLabel('ID')).hasAttribute('readonly')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0]).toEqual(config);
    // No toast do template (#325), na região status do ToastProvider.
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Configuração salva (versão 2).'),
    );
    expect(screen.getByRole('status').querySelector('.notification')).not.toBeNull();
  });

  it('edição: "Salvando…" durante o envio, com o botão desabilitado', async () => {
    const user = userEvent.setup();
    const reply = deferred();
    renderForm('edit', reply.promise);

    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));

    expect(await screen.findByRole('button', { name: 'Salvando…' })).toHaveProperty(
      'disabled',
      true,
    );
    reply.finish({ ok: true, message: 'Configuração salva (versão 2).' });
    await screen.findByRole('button', { name: 'Salvar configuração' });
  });

  it('cadastro: "Cadastrando…" durante o envio e depois vai para /sites com a marca do site', async () => {
    const user = userEvent.setup();
    const reply = deferred();
    const action = renderForm('create', reply.promise);

    await user.click(screen.getByRole('button', { name: 'Cadastrar site' }));

    const pending = await screen.findByRole('button', { name: 'Cadastrando…' });
    expect(pending).toHaveProperty('disabled', true);
    await user.click(pending);
    expect(action).toHaveBeenCalledTimes(1);
    reply.finish({ ok: true, message: 'Site exemplo-c cadastrado.' });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sites?cadastrado=exemplo-c'));
  });

  it('a recusa do domínio vai para o campo do path, com foco, e a mensagem para o resumo', async () => {
    const user = userEvent.setup();
    renderEdit({
      ok: false,
      message: 'Não foi possível salvar a configuração.',
      issues: [{ path: ['presets', 'home'], message: 'Preset "x" de home não é suportado' }],
    });

    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));

    const home = screen.getByLabelText(fieldLabel('Preset da página Home'));
    await waitFor(() => expect(document.activeElement).toBe(home));
    expect(home.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Preset "x" de home não é suportado')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível salvar a configuração.',
    );
  });
});

describe('seções da configuração do site', () => {
  it('cada chave visível do schema está em exatamente uma seção', () => {
    const declared = SITE_CONFIG_SECTIONS.flatMap((section) => section.paths);
    const visible = Object.keys(SiteConfigSchema.shape).filter(
      (key) => !SITE_CONFIG_HIDDEN.includes(key),
    );
    expect([...declared].sort()).toEqual([...visible].sort());
  });

  it.each(['create', 'edit'] as const)(
    '%s: seis seções com h2, índice no topo e todos os campos dentro de uma seção',
    (mode) => {
      renderForm(mode, { ok: true, message: '' });

      const titles = SITE_CONFIG_SECTIONS.map((section) => section.title);
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual(titles);
      const nav = screen.getByRole('navigation', { name: 'Seções do formulário' });
      expect(
        within(nav)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(titles);

      const regions = titles.map((title) => screen.getByRole('region', { name: title }));
      const form = screen
        .getByRole('button', { name: /Cadastrar site|Salvar configuração/ })
        .closest('form') as HTMLFormElement;
      const controls = [...form.querySelectorAll('input, select, textarea')];
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        expect(regions.some((region) => region.contains(control))).toBe(true);
      }
      expect(within(regions[2] as HTMLElement).getByLabelText(fieldLabel('Tema'))).toBeTruthy();
      expect(
        within(regions[4] as HTMLElement).getByLabelText(fieldLabel('Indexável')),
      ).toBeTruthy();
    },
  );
  it.each([
    ['create', 'Cadastrar site', '/sites'],
    ['edit', 'Salvar configuração', '/sites/exemplo-a'],
  ] as const)(
    '%s: ID e nome, idioma e fuso lado a lado; a barra fixa leva a ação principal',
    (mode, submit, back) => {
      renderForm(mode, { ok: true, message: '' });

      for (const [first, second] of [
        ['ID', 'Nome'],
        ['Idioma', 'Fuso horário'],
      ] as const) {
        const pair = screen.getByLabelText(fieldLabel(first)).closest('.grid');
        expect(pair?.className).toContain('md:grid-cols-2');
        expect(pair?.contains(screen.getByLabelText(fieldLabel(second)))).toBe(true);
      }
      const bar = screen.getByRole('button', { name: submit }).closest('.sticky');
      expect(bar).not.toBeNull();
      if (mode === 'edit') {
        expect(within(bar as HTMLElement).getByRole('link', { name: 'Voltar' })).toHaveProperty(
          'pathname',
          back,
        );
      } else {
        expect(within(bar as HTMLElement).getByRole('button', { name: 'Descartar' })).toBeTruthy();
      }
    },
  );
});

describe('tema na configuração do site (#163)', () => {
  it('escolhe entre todos os temas de THEME_IDS, pelo nome, sem texto livre nem a dica antiga', () => {
    renderForm('edit', { ok: true, message: '' });

    const group = screen.getByRole('radiogroup', { name: 'Tema' });
    const radios = within(group).getAllByRole<HTMLInputElement>('radio');
    expect(radios.map((radio) => radio.value)).toEqual([...THEME_IDS]);
    for (const summary of THEME_SUMMARIES) {
      expect(within(group).getByRole('radio', { name: new RegExp(summary.name) })).toBeTruthy();
    }
    expect(within(group).getByRole('radio', { name: /Editorial claro/ })).toHaveProperty(
      'checked',
      true,
    );
    expect(within(group).queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('ID do tema em @orakel/tokens.')).toBeNull();
  });
});
