// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';

import { ReviewPanel } from './ReviewPanel.tsx';

// Painel da revisão (#75): erros da release, checklist com os rótulos recebidos, bloqueio,
// permissão e a mensagem de aprovação (no toast, #325). No Ecme (#277), o conteúdo fica num Card.

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
});

// Os itens de REVIEW_CHECKLIST (domínio), como a página os passa.
const checklist = [
  {
    key: 'valor_original',
    label: 'Valor original: informação, análise ou experiência que não é só paráfrase das fontes',
  },
  {
    key: 'politicas_anuncios_afiliados',
    label: 'Conforme as políticas de conteúdo dos programas de anúncios e afiliados',
  },
  { key: 'descricao_imagens', label: 'Descrição em todas as imagens de conteúdo' },
  {
    key: 'visualizacao_conferida',
    label: 'Visualização conferida: o conteúdo como vai ficar no site',
  },
  { key: 'imagens_decorativas_marcadas', label: 'Imagens decorativas marcadas como tal' },
];

type Props = ComponentProps<typeof ReviewPanel>;

const renderPanel = (props: Partial<Props> = {}) =>
  render(
    <ReviewPanel
      version={2}
      status="em_revisao"
      issues={[]}
      checklist={checklist}
      canApprove
      previewUrl="https://preview.orakel.localhost/exemplo-a/guia/"
      approve={vi.fn()}
      {...props}
    />,
  );

describe('painel de revisão', () => {
  it('mostra os 5 itens do checklist com os rótulos recebidos, como caixas de seleção', () => {
    renderPanel();

    for (const item of checklist) {
      expect(screen.getByRole('checkbox', { name: item.label })).toBeTruthy();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.getByText('Nenhum problema de validação.')).toBeTruthy();
  });

  it('fica num Card dentro do complementar rotulado pela versão', () => {
    renderPanel();

    const panel = screen.getByRole('complementary', { name: 'Revisão da versão 2' });
    const card = panel.querySelector(':scope > .card');
    expect(card).toBeTruthy();
    expect(card?.contains(screen.getByRole('button', { name: 'Aprovar' }))).toBe(true);
    expect(card?.contains(screen.getByRole('heading', { name: 'Validação da release' }))).toBe(
      true,
    );
    // O checklist fica no cartão do painel: sem a barra fixa nem cartão próprio (#328).
    expect(panel.querySelector('.sticky')).toBeNull();
    expect(card?.querySelectorAll('.card')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Voltar' })).toBeNull();
  });

  it('liga para a visualização em nova aba', () => {
    renderPanel();

    const link = screen.getByRole('link', { name: 'Abrir a visualização em nova aba' });
    expect(link.getAttribute('href')).toBe('https://preview.orakel.localhost/exemplo-a/guia/');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('com bloco fora da release, mostra o erro e bloqueia aprovar, com o motivo', () => {
    renderPanel({
      issues: [{ message: 'O bloco faq não é suportado pela release do site' }],
    });

    const issue = screen.getByText('O bloco faq não é suportado pela release do site');
    expect(issue.closest('ul')?.classList.contains('text-error')).toBe(true);
    const button = screen.getByRole('button', { name: 'Aprovar' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Corrija os problemas de validação antes de aprovar.');
  });

  it('sem content.publish, não há ação de aprovar; o checklist aparece só para leitura', () => {
    renderPanel({ canApprove: false });

    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(checklist[0]!.label)).toBeTruthy();
  });

  it('checklist incompleto não chama a aprovação', async () => {
    const approve = vi.fn();
    renderPanel({ approve });

    await userEvent.click(screen.getByRole('checkbox', { name: checklist[0]!.label }));
    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(approve).not.toHaveBeenCalled();
    expect(screen.getAllByText('Marque este item para aprovar.')).toHaveLength(4);
  });

  it('pelo teclado, com o checklist completo, aprova com as chaves e anuncia no toast', async () => {
    const approve = vi.fn().mockResolvedValue({ ok: true, message: 'Versão 2 aprovada.' });
    const { rerender } = renderPanel({ approve });
    render(<ToastProvider />);
    const user = userEvent.setup();

    for (const item of checklist) {
      screen.getByRole('checkbox', { name: item.label }).focus();
      await user.keyboard(' ');
    }
    screen.getByRole('button', { name: 'Aprovar' }).focus();
    await user.keyboard('{Enter}');

    expect(approve).toHaveBeenCalledWith(checklist.map((item) => item.key));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Versão 2 aprovada.'));
    expect(screen.getByRole('status').querySelector('.notification')).not.toBeNull();

    // A página revalida com a versão aprovada: o painel continua, sem o formulário; o aviso
    // fica no toast, fora do painel.
    rerender(
      <ReviewPanel
        version={2}
        status="aprovado"
        issues={[]}
        checklist={checklist}
        canApprove
        previewUrl="https://preview.orakel.localhost/exemplo-a/guia/"
        approve={approve}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.getByRole('complementary').querySelector('[role="status"]')).toBeNull();
  });

  it('recusa do domínio aparece no resumo do formulário', async () => {
    const approve = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: [
        { path: [], message: 'A versão 2 não é a mais recente: o conteúdo está na versão 3' },
      ],
    });
    renderPanel({ approve });

    for (const item of checklist) {
      await userEvent.click(screen.getByRole('checkbox', { name: item.label }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect((await screen.findByRole('alert')).textContent).toContain('não é a mais recente');
  });

  it('versão fora de em revisão mostra o status, sem formulário', () => {
    renderPanel({ status: 'rascunho' });

    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(
      screen.getByText(/Esta versão está rascunho: só uma versão em revisão pode ser aprovada/),
    ).toBeTruthy();
  });
});
