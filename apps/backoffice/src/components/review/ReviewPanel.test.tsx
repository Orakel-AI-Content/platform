// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';

import { ReviewChecks } from './ReviewChecks.tsx';
import type { ReviewCheckItem } from './reviewCheckItems.ts';
import { ReviewPanel } from './ReviewPanel.tsx';

// Painel da revisão (#75): checagens automáticas (workspace#87), checklist com "Marcar todos", com os rótulos recebidos, bloqueio,
// permissão e a mensagem de aprovação (no toast, #325). As caixas abrem com as confirmações
// gravadas na versão e gravam a cada clique (#752); a recusa desfaz e é anunciada. No Ecme (#277), o conteúdo fica em Cards;
// o checklist tem o seu, com "Aprovar" no rodapé (#333). "Devolver ao editor" (#598) tem cartão
// próprio, com o comentário obrigatório.

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
  {
    key: 'visualizacao_conferida',
    label: 'Visualização conferida: o conteúdo como vai ficar no site',
  },
];

type Props = ComponentProps<typeof ReviewPanel>;

const allKeys = checklist.map((item) => item.key);

/** Ações de confirmar como o servidor: grava numa lista e devolve as chaves gravadas depois. */
function server(initial: readonly string[] = []) {
  let saved = [...initial];
  const reply = () => Promise.resolve({ ok: true as const, confirmed: [...saved] });
  return {
    confirmed: initial,
    confirm: vi.fn((key: string, confirmed: boolean) => {
      saved = confirmed ? [...new Set([...saved, key])] : saved.filter((item) => item !== key);
      return reply();
    }),
    confirmAll: vi.fn((confirmed: boolean) => {
      saved = confirmed ? [...allKeys] : [];
      return reply();
    }),
  };
}

const checkbox = (label: string) => screen.getByRole<HTMLInputElement>('checkbox', { name: label });

// Itens como a página os monta: avisos (capa, link externo fora do ar) não bloqueiam.
const warnings: ReviewCheckItem[] = [
  {
    key: 'capa',
    label: 'Imagem de capa',
    state: 'aviso',
    findings: [{ message: 'O conteúdo não tem imagem de capa', where: 'Capa' }],
  },
  {
    key: 'links_externos',
    label: 'Links externos respondem',
    state: 'aviso',
    findings: [{ message: 'O link https://x.example não respondeu: HTTP 404', where: 'Bloco 2' }],
  },
];

const renderPanel = (props: Partial<Props> = {}) =>
  render(
    <ReviewPanel
      version={2}
      status="em_revisao"
      blocked={false}
      checklist={checklist}
      canApprove
      approve={vi.fn()}
      giveBack={vi.fn()}
      {...server()}
      {...props}
    />,
  );

describe('painel de revisão', () => {
  it('mostra os 3 itens do checklist com os rótulos recebidos, como caixas de seleção', () => {
    renderPanel();

    for (const item of checklist) {
      expect(screen.getByRole('checkbox', { name: item.label })).toBeTruthy();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(document.querySelector('.bg-error-subtle')).toBeNull();
  });

  it('fica em Cards dentro do complementar; o checklist tem cartão próprio com Aprovar no rodapé', () => {
    renderPanel({ checks: <ReviewChecks items={warnings} /> });

    const panel = screen.getByRole('complementary', { name: 'Revisão da versão 2' });
    const [main, ...rest] = panel.querySelectorAll('.card');
    expect(main?.contains(screen.getByRole('heading', { name: 'Checagens automáticas' }))).toBe(
      true,
    );
    // O checklist num cartão próprio, com "Aprovar" (solid) no rodapé, sem barra fixa (#333), e a
    // devolução noutro (#598).
    expect(rest).toHaveLength(2);
    const checklistCard = rest[0];
    expect(checklistCard?.contains(screen.getByRole('heading', { name: 'Checklist' }))).toBe(true);
    const approve = screen.getByRole('button', { name: 'Aprovar' });
    expect(checklistCard?.querySelector('.card-footer')?.contains(approve)).toBe(true);
    expect(approve.className).toContain('bg-primary');
    expect(main?.contains(approve)).toBe(false);
    expect(panel.querySelector('.sticky')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Voltar' })).toBeNull();
  });

  it('títulos na escala do guia: as seções em h2, nenhum h3 no tamanho de h2, sem o link da prévia', () => {
    renderPanel({ checks: <ReviewChecks items={warnings} /> });

    const panel = screen.getByRole('complementary', { name: 'Revisão da versão 2' });
    const headings = [...panel.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    expect(headings.map((heading) => [heading.tagName, heading.textContent])).toEqual([
      ['H2', 'Checagens automáticas'],
      ['H2', 'Checklist'],
      ['H2', 'Devolver ao editor'],
    ]);
    for (const heading of panel.querySelectorAll('h3')) {
      expect(heading.className).not.toContain('text-lg');
    }
    // "Abrir prévia" é ação do cabeçalho da página (#373).
    expect(panel.querySelector('a')).toBeNull();
  });

  it('com erro nas checagens, bloqueia aprovar, com o motivo', () => {
    renderPanel({ blocked: true, confirmed: allKeys });

    // Aviso no Alert de erro do Ecme, com ícone, sem `text-error` à mão e sem região viva: chega
    // no carregamento (#444).
    const blocked = screen.getByText(
      'Corrija os erros das checagens automáticas antes de aprovar.',
    );
    const alert = blocked.closest('.bg-error-subtle');
    expect(alert).toBeTruthy();
    expect(alert?.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
    expect(blocked.closest('[role="alert"]')).toBeNull();
    expect(document.querySelector('.text-error:not([aria-hidden="true"])')).toBeNull();
    const button = screen.getByRole('button', { name: 'Aprovar' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')).toBe(blocked);
  });

  it('sem content.publish, não há ação de aprovar; o checklist aparece só para leitura', () => {
    renderPanel({ canApprove: false });

    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devolver ao editor' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(checklist[0]!.label)).toBeTruthy();
  });

  it('abre com as confirmações gravadas na versão (ex.: depois de uma correção só na capa)', () => {
    renderPanel({ confirmed: ['valor_original', 'politicas_anuncios_afiliados'] });

    expect(checkbox(checklist[0]!.label).checked).toBe(true);
    expect(checkbox(checklist[1]!.label).checked).toBe(true);
    expect(checkbox(checklist[2]!.label).checked).toBe(false);
  });

  it('com o checklist incompleto, "Aprovar" fica desabilitado, com o motivo', () => {
    renderPanel({ confirmed: ['valor_original', 'politicas_anuncios_afiliados'] });

    const button = screen.getByRole('button', { name: 'Aprovar' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(
      document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Marque todos os itens para aprovar.');
  });

  it('marcar e desmarcar uma caixa grava na hora, com a chave e o novo estado', async () => {
    const actions = server(['valor_original']);
    renderPanel(actions);

    await userEvent.click(checkbox(checklist[2]!.label));
    await userEvent.click(checkbox(checklist[0]!.label));

    expect(actions.confirm.mock.calls).toEqual([
      ['visualizacao_conferida', true],
      ['valor_original', false],
    ]);
    await waitFor(() => expect(checkbox(checklist[0]!.label).checked).toBe(false));
    expect(checkbox(checklist[2]!.label).checked).toBe(true);
  });

  it('fica com as chaves que o servidor devolve, não com as supostas', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: true, confirmed: allKeys });
    renderPanel({ confirm });

    await userEvent.click(checkbox(checklist[0]!.label));

    await waitFor(() => expect(checkbox(checklist[2]!.label).checked).toBe(true));
    expect(screen.getByRole('button', { name: 'Aprovar' }).hasAttribute('disabled')).toBe(false);
  });

  it('falha ao gravar é anunciada e a caixa volta ao estado anterior', async () => {
    const confirm = vi
      .fn()
      .mockResolvedValue({ ok: false, message: 'Sem permissão para content.publish' });
    renderPanel({ confirm });

    await userEvent.click(checkbox(checklist[0]!.label));

    const message = await screen.findByText('Sem permissão para content.publish');
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(checkbox(checklist[0]!.label).checked).toBe(false);
  });

  it('ação que falha sem resposta também desfaz e anuncia', async () => {
    const confirm = vi.fn().mockRejectedValue(new Error('rede'));
    renderPanel({ confirmed: ['valor_original'], confirm });

    await userEvent.click(checkbox(checklist[0]!.label));

    expect(
      await screen.findByText('Não foi possível gravar a confirmação; tente de novo.'),
    ).toBeTruthy();
    expect(checkbox(checklist[0]!.label).checked).toBe(true);
  });

  it('pelo teclado, com o checklist completo, aprova sem enviar o checklist e anuncia no toast', async () => {
    const approve = vi.fn().mockResolvedValue({ ok: true, message: 'Versão 2 aprovada.' });
    const actions = server();
    const { rerender } = renderPanel({ approve, ...actions });
    render(<ToastProvider />);
    const user = userEvent.setup();

    for (const item of checklist) {
      checkbox(item.label).focus();
      await user.keyboard(' ');
    }
    expect(actions.confirm.mock.calls).toEqual(allKeys.map((key) => [key, true]));
    const button = screen.getByRole('button', { name: 'Aprovar' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    button.focus();
    await user.keyboard('{Enter}');

    expect(approve).toHaveBeenCalledWith();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Versão 2 aprovada.'));
    expect(screen.getByRole('status').querySelector('.notification')).not.toBeNull();

    // A página revalida com a versão aprovada: o painel continua, sem o formulário; o aviso
    // fica no toast, fora do painel.
    rerender(
      <ReviewPanel
        version={2}
        status="aprovado"
        blocked={false}
        checklist={checklist}
        canApprove
        approve={approve}
        giveBack={vi.fn()}
        {...server(allKeys)}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.getByRole('complementary').querySelector('[role="status"]')).toBeNull();
  });

  it('"Marcar todos" grava as três confirmações, e "Aprovar" funciona em seguida', async () => {
    const approve = vi.fn().mockResolvedValue({ ok: true, message: 'Versão 2 aprovada.' });
    const actions = server();
    renderPanel({ approve, ...actions });

    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos' }));
    expect(actions.confirmAll).toHaveBeenCalledExactlyOnceWith(true);
    expect(actions.confirm).not.toHaveBeenCalled();
    for (const item of checklist) expect(checkbox(item.label).checked).toBe(true);
    const button = screen.getByRole('button', { name: 'Aprovar' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    await userEvent.click(button);

    expect(approve).toHaveBeenCalledWith();
  });

  it('falha de "Marcar todos" volta as caixas ao que estava gravado', async () => {
    const confirmAll = vi.fn().mockResolvedValue({ ok: false, message: 'Versão já decidida.' });
    renderPanel({ confirmed: ['valor_original'], confirmAll });

    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos' }));

    expect(await screen.findByText('Versão já decidida.')).toBeTruthy();
    expect(checklist.map((item) => checkbox(item.label).checked)).toEqual([true, false, false]);
  });

  it('só com avisos nas checagens, "Aprovar" fica habilitado', () => {
    renderPanel({ checks: <ReviewChecks items={warnings} />, blocked: false, confirmed: allKeys });

    expect(screen.getByText('O link https://x.example não respondeu: HTTP 404')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprovar' }).hasAttribute('disabled')).toBe(false);
  });

  it('sem content.publish, não há "Marcar todos"', () => {
    renderPanel({ canApprove: false });

    expect(screen.queryByRole('button', { name: 'Marcar todos' })).toBeNull();
  });

  it('recusa do domínio aparece no resumo do formulário', async () => {
    const approve = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: [
        { path: [], message: 'A versão 2 não é a mais recente: o conteúdo está na versão 3' },
      ],
    });
    renderPanel({ approve, confirmed: allKeys });

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    // Cada formulário tem o próprio resumo (região viva); a recusa vai ao da aprovação.
    const refusal = await screen.findByText(/não é a mais recente/);
    expect(refusal.closest('[role="alert"]')).not.toBeNull();
  });

  it('versão fora de em revisão mostra o status, sem formulário', () => {
    renderPanel({ status: 'rascunho' });

    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devolver ao editor' })).toBeNull();
    expect(
      screen.getByText(/Esta versão está rascunho: só uma versão em revisão pode ser aprovada/),
    ).toBeTruthy();
  });

  it('devolver exige o comentário: vazio não chama a ação e o erro fica no campo', async () => {
    const giveBack = vi.fn();
    renderPanel({ giveBack });

    await userEvent.type(screen.getByRole('textbox', { name: /O que corrigir/ }), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Devolver ao editor' }));

    expect(giveBack).not.toHaveBeenCalled();
    expect(screen.getByText('Escreva o que o editor precisa corrigir.')).toBeTruthy();
  });

  it('com erro nas checagens, devolver continua disponível', () => {
    renderPanel({ blocked: true });

    const button = screen.getByRole('button', { name: 'Devolver ao editor' });
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('devolve com o comentário, anuncia no toast e tira os dois formulários', async () => {
    const giveBack = vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'Versão 2 devolvida ao editor.' });
    renderPanel({ giveBack });
    render(<ToastProvider />);

    await userEvent.type(
      screen.getByRole('textbox', { name: /O que corrigir/ }),
      'Falta a fonte da tabela.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Devolver ao editor' }));

    expect(giveBack).toHaveBeenCalledWith('Falta a fonte da tabela.');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Versão 2 devolvida ao editor.'),
    );
    expect(screen.queryByRole('button', { name: 'Devolver ao editor' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
  });

  it('recusa do comentário pelo domínio aparece no campo', async () => {
    const giveBack = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Não foi possível devolver.',
      issues: [{ path: ['comment'], message: 'Escreva o que o editor precisa corrigir.' }],
    });
    renderPanel({ giveBack });

    await userEvent.type(screen.getByRole('textbox', { name: /O que corrigir/ }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Devolver ao editor' }));

    const field = screen.getByRole('textbox', { name: /O que corrigir/ });
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
  });
});
