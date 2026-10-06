// @vitest-environment happy-dom
import { RESOURCES, type SiteConfig } from '@orakel/content-model/v1';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { editValues } from './site-config-form-values.ts';
import type { SiteFormResult } from './site-config-form-values.ts';
import { SiteConfigForm } from './site-config-form.tsx';

// Formulário da configuração do site no gerador (#47): ida e volta da SiteConfig, SITE_ID só
// leitura na edição e recusa do domínio no campo, com foco.

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
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
  theme: 'padrao',
  presets: { home: 'revista', artigo: 'padrao', categoria: 'padrao', autor: 'padrao' },
  variants: { articleCard: 'horizontal' },
  featureFlags: { busca: true, comentarios: false },
  crawlers: { block: ['GPTBot'] },
  integrations: { ga4: { enabled: true, measurementId: 'G-ABC123' } },
};

const options = { presets: RESOURCES.presets, variants: RESOURCES.variants };

function renderEdit(result: SiteFormResult) {
  const action = vi.fn<(value: SiteConfig) => Promise<SiteFormResult>>(() =>
    Promise.resolve(result),
  );
  render(
    <SiteConfigForm
      mode="edit"
      defaultValues={editValues({ ...config, institutionalTexts: { about: [] } })}
      options={options}
      action={action}
    />,
  );
  return action;
}

describe('formulário da configuração do site', () => {
  it('salvar sem mudar envia a mesma configuração, sem os textos institucionais', async () => {
    const user = userEvent.setup();
    const action = renderEdit({ ok: true, message: 'Configuração salva (versão 2).' });

    expect(screen.getByLabelText('SITE_ID').hasAttribute('readonly')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0]).toEqual(config);
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Configuração salva (versão 2).',
    );
  });

  it('a recusa do domínio vai para o campo do path, com foco, e a mensagem para o resumo', async () => {
    const user = userEvent.setup();
    renderEdit({
      ok: false,
      message: 'Não foi possível salvar a configuração.',
      issues: [{ path: ['presets', 'home'], message: 'Preset "x" de home não é suportado' }],
    });

    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));

    const home = screen.getByLabelText('Preset da página Home');
    await waitFor(() => expect(document.activeElement).toBe(home));
    expect(home.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Preset "x" de home não é suportado')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível salvar a configuração.',
    );
  });
});
