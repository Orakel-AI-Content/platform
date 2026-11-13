// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
// o checklist tem o seu, com as aprovações no rodapé (#333): "Aprovar e publicar agora", "Aprovar
// e agendar" e "Só aprovar" (workspace#89), com o desfecho e o aviso de transbordo no cartão.
// "Devolver ao editor" (#598) tem cartão próprio, com o comentário obrigatório. Em passos (#766):
// Checagens, Ajustes, Leitura (o checklist) e Decisão (as aprovações e a devolução), todos
// montados e os inativos com `hidden`; o passo vem da prop `step` e a troca vai a `?passo=`.
// Depois da decisão, a tela abre o próximo da fila ou diz que ela acabou (workspace#90).

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const search = vi.hoisted(() => ({ value: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/sites/exemplo-a/revisao/7',
  useSearchParams: () => new URLSearchParams(search.value),
}));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(async () => {
  router.replace.mockClear();
  router.push.mockReset();
  search.value = '';
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

const APPROVALS = ['Aprovar e publicar agora', 'Aprovar e agendar', 'Só aprovar'] as const;
const approvals = () => APPROVALS.map((name) => screen.getByRole('button', { name }));

const STEP_TITLES = ['Checagens', 'Ajustes', 'Leitura', 'Decisão'];

/** A etapa marcada como atual no `Steps`, pelo título. */
const currentStep = () =>
  document.querySelector('[aria-current="step"]')?.querySelector('.step-item-title')?.textContent;

const next = () => userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
const previous = () => userEvent.click(screen.getByRole('button', { name: 'Anterior' }));

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
      approvePublish={vi.fn()}
      approveSchedule={vi.fn()}
      giveBack={vi.fn()}
      {...server()}
      {...props}
    />,
  );

describe('painel de revisão', () => {
  it('mostra os 3 itens do checklist com os rótulos recebidos, como caixas de seleção', () => {
    renderPanel({ step: 'leitura' });

    for (const item of checklist) {
      expect(screen.getByRole('checkbox', { name: item.label })).toBeTruthy();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(document.querySelector('.bg-error-subtle')).toBeNull();
  });

  it('mostra os quatro passos no Steps, com o atual marcado, e Anterior e Próximo no rodapé', () => {
    renderPanel({ checks: <ReviewChecks items={warnings} /> });

    const panel = screen.getByRole('complementary', { name: 'Revisão da versão 2' });
    const steps = within(panel).getByRole('list', { name: 'Passos da revisão' });
    const items = within(steps).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.step-item-title')?.textContent)).toEqual(
      STEP_TITLES,
    );
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([
      'step',
      null,
      null,
      null,
    ]);
    // Etapas sem clique, como no exemplo "Controlled" do Ecme: só os dois botões navegam.
    expect(within(steps).queryByRole('button')).toBeNull();
    const buttons = [...panel.querySelectorAll('button')].filter((button) =>
      ['Anterior', 'Próximo'].includes(button.textContent ?? ''),
    );
    expect(buttons.map((button) => button.textContent)).toEqual(['Anterior', 'Próximo']);
    expect(screen.getByRole('button', { name: 'Anterior' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Próximo' }).hasAttribute('disabled')).toBe(false);
    // O rodapé vem depois dos passos.
    expect(panel.lastElementChild?.contains(buttons[0]!)).toBe(true);
    expect(panel.querySelector('.sticky')).toBeNull();
  });

  it('todos os passos ficam montados; só o atual fica visível, cada um com a sua peça', () => {
    renderPanel({ checks: <ReviewChecks items={warnings} /> });

    const step = (key: string) => document.querySelector<HTMLElement>(`[data-step="${key}"]`)!;
    expect(['checagens', 'ajustes', 'leitura', 'decisao'].map((key) => step(key).hidden)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect(
      step('checagens').contains(screen.getByRole('heading', { name: 'Checagens automáticas' })),
    ).toBe(true);
    expect(step('ajustes').querySelector('h2')?.textContent).toBe('Ajustes');
    expect(step('ajustes').querySelector('button, input, textarea')).toBeNull();
    expect(step('leitura').querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(step('leitura').textContent).toContain('Marcar todos');
    for (const name of [...APPROVALS, 'Devolver ao editor']) {
      expect(step('decisao').textContent).toContain(name);
    }
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('Próximo e Anterior trocam o passo e gravam ?passo=, sem perder os outros parâmetros', async () => {
    search.value = 'origem=fila';
    renderPanel();

    await next();
    expect(currentStep()).toBe('Ajustes');
    expect(router.replace).toHaveBeenLastCalledWith(
      '/sites/exemplo-a/revisao/7?origem=fila&passo=ajustes',
      { scroll: false },
    );
    await next();
    await next();
    expect(currentStep()).toBe('Decisão');
    expect(router.replace).toHaveBeenLastCalledWith(
      '/sites/exemplo-a/revisao/7?origem=fila&passo=decisao',
      { scroll: false },
    );
    expect(screen.getByRole('button', { name: 'Próximo' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Só aprovar' })).toBeTruthy();

    await previous();
    expect(currentStep()).toBe('Leitura');
    expect(router.replace).toHaveBeenLastCalledWith(
      '/sites/exemplo-a/revisao/7?origem=fila&passo=leitura',
      { scroll: false },
    );
  });

  it('abre no passo de ?passo=; ausente ou desconhecido, em Checagens', () => {
    const { unmount } = renderPanel({ step: 'decisao' });
    expect(currentStep()).toBe('Decisão');
    expect(screen.getByRole('button', { name: 'Só aprovar' })).toBeTruthy();
    unmount();

    const other = renderPanel({ step: 'inexistente' });
    expect(currentStep()).toBe('Checagens');
    other.unmount();

    renderPanel();
    expect(currentStep()).toBe('Checagens');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('numa versão nova (outro key), continua no passo da URL', () => {
    const props = { status: 'em_revisao' as const, blocked: false, checklist, canApprove: true };
    const actions = {
      approve: vi.fn(),
      approvePublish: vi.fn(),
      approveSchedule: vi.fn(),
      giveBack: vi.fn(),
    };
    const { rerender } = render(
      <ReviewPanel key={2} version={2} step="leitura" {...props} {...actions} {...server()} />,
    );
    expect(currentStep()).toBe('Leitura');

    rerender(
      <ReviewPanel key={3} version={3} step="leitura" {...props} {...actions} {...server()} />,
    );
    expect(screen.getByRole('complementary', { name: 'Revisão da versão 3' })).toBeTruthy();
    expect(currentStep()).toBe('Leitura');
  });

  it('ao avançar e voltar, as caixas marcadas e o comentário digitado continuam', async () => {
    const actions = server();
    renderPanel({ step: 'leitura', ...actions });

    await userEvent.click(checkbox(checklist[0]!.label));
    await next();
    await userEvent.type(
      screen.getByRole('textbox', { name: /O que corrigir/ }),
      'Falta a fonte da tabela.',
    );
    await previous();
    await previous();
    await next();

    expect(currentStep()).toBe('Leitura');
    await waitFor(() => expect(checkbox(checklist[0]!.label).checked).toBe(true));
    expect(checkbox(checklist[1]!.label).checked).toBe(false);
    await next();
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: /O que corrigir/ }).value).toBe(
      'Falta a fonte da tabela.',
    );
    expect(actions.confirm).toHaveBeenCalledOnce();
  });

  it('títulos na escala do guia: as seções em h2, nenhum h3 no tamanho de h2, sem o link da prévia', () => {
    renderPanel({ checks: <ReviewChecks items={warnings} /> });

    const panel = screen.getByRole('complementary', { name: 'Revisão da versão 2' });
    const headings = [...panel.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    expect(headings.map((heading) => [heading.tagName, heading.textContent])).toEqual([
      ['H2', 'Checagens automáticas'],
      ['H2', 'Ajustes'],
      ['H2', 'Checklist'],
      ['H2', 'Decisão'],
      ['H2', 'Devolver ao editor'],
    ]);
    for (const heading of panel.querySelectorAll('h3')) {
      expect(heading.className).not.toContain('text-lg');
    }
    // "Abrir prévia" é ação do cabeçalho da página (#373).
    expect(panel.querySelector('a')).toBeNull();
  });

  it('com erro nas checagens, bloqueia as três aprovações, com o motivo', () => {
    renderPanel({ step: 'decisao', blocked: true, confirmed: allKeys });

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
    for (const button of approvals()) {
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.getAttribute('aria-describedby')).toBeTruthy();
      expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')).toBe(blocked);
    }
  });

  it('sem content.publish, não há ação de aprovar; o checklist aparece só para leitura', () => {
    const { unmount } = renderPanel({ step: 'leitura', canApprove: false });

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(checklist[0]!.label).closest('li')).toBeTruthy();
    unmount();

    renderPanel({ step: 'decisao', canApprove: false });
    for (const name of APPROVALS) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devolver ao editor' })).toBeNull();
    expect(screen.getByText('Só quem pode publicar decide a revisão.')).toBeTruthy();
  });

  it('abre com as confirmações gravadas na versão (ex.: depois de uma correção só na capa)', () => {
    renderPanel({ step: 'leitura', confirmed: ['valor_original', 'politicas_anuncios_afiliados'] });

    expect(checkbox(checklist[0]!.label).checked).toBe(true);
    expect(checkbox(checklist[1]!.label).checked).toBe(true);
    expect(checkbox(checklist[2]!.label).checked).toBe(false);
  });

  it('com o checklist incompleto, as três aprovações ficam desabilitadas, com o motivo', () => {
    renderPanel({ step: 'decisao', confirmed: ['valor_original', 'politicas_anuncios_afiliados'] });

    for (const button of approvals()) {
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(
        document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toBe('Marque todos os itens para aprovar.');
    }
  });

  it('marcar e desmarcar uma caixa grava na hora, com a chave e o novo estado', async () => {
    const actions = server(['valor_original']);
    renderPanel({ step: 'leitura', ...actions });

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
    renderPanel({ step: 'leitura', confirm });

    await userEvent.click(checkbox(checklist[0]!.label));

    await waitFor(() => expect(checkbox(checklist[2]!.label).checked).toBe(true));
    await next();
    expect(screen.getByRole('button', { name: 'Só aprovar' }).hasAttribute('disabled')).toBe(false);
  });

  it('falha ao gravar é anunciada e a caixa volta ao estado anterior', async () => {
    const confirm = vi
      .fn()
      .mockResolvedValue({ ok: false, message: 'Sem permissão para content.publish' });
    renderPanel({ step: 'leitura', confirm });

    await userEvent.click(checkbox(checklist[0]!.label));

    const message = await screen.findByText('Sem permissão para content.publish');
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(checkbox(checklist[0]!.label).checked).toBe(false);
  });

  it('ação que falha sem resposta também desfaz e anuncia', async () => {
    const confirm = vi.fn().mockRejectedValue(new Error('rede'));
    renderPanel({ step: 'leitura', confirmed: ['valor_original'], confirm });

    await userEvent.click(checkbox(checklist[0]!.label));

    expect(
      await screen.findByText('Não foi possível gravar a confirmação; tente de novo.'),
    ).toBeTruthy();
    expect(checkbox(checklist[0]!.label).checked).toBe(true);
  });

  it('pelo teclado, com o checklist completo, aprova sem enviar o checklist e anuncia no toast', async () => {
    const approve = vi.fn().mockResolvedValue({ ok: true, message: 'Versão 2 aprovada.' });
    const actions = server();
    const { rerender } = renderPanel({ step: 'leitura', approve, ...actions });
    render(<ToastProvider />);
    const user = userEvent.setup();

    for (const item of checklist) {
      checkbox(item.label).focus();
      await user.keyboard(' ');
    }
    expect(actions.confirm.mock.calls).toEqual(allKeys.map((key) => [key, true]));
    await next();
    const button = screen.getByRole('button', { name: 'Só aprovar' });
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
        step="decisao"
        blocked={false}
        checklist={checklist}
        canApprove
        approve={approve}
        approvePublish={vi.fn()}
        approveSchedule={vi.fn()}
        giveBack={vi.fn()}
        {...server(allKeys)}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Só aprovar' })).toBeNull();
    expect(screen.getByRole('complementary').querySelector('[role="status"]')).toBeNull();
  });

  it('"Marcar todos" grava as três confirmações, e "Só aprovar" funciona em seguida', async () => {
    const approve = vi.fn().mockResolvedValue({ ok: true, message: 'Versão 2 aprovada.' });
    const actions = server();
    renderPanel({ step: 'leitura', approve, ...actions });

    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos' }));
    expect(actions.confirmAll).toHaveBeenCalledExactlyOnceWith(true);
    expect(actions.confirm).not.toHaveBeenCalled();
    for (const item of checklist) expect(checkbox(item.label).checked).toBe(true);
    await next();
    const button = screen.getByRole('button', { name: 'Só aprovar' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    await userEvent.click(button);

    expect(approve).toHaveBeenCalledWith();
  });

  it('falha de "Marcar todos" volta as caixas ao que estava gravado', async () => {
    const confirmAll = vi.fn().mockResolvedValue({ ok: false, message: 'Versão já decidida.' });
    renderPanel({ step: 'leitura', confirmed: ['valor_original'], confirmAll });

    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos' }));

    expect(await screen.findByText('Versão já decidida.')).toBeTruthy();
    expect(checklist.map((item) => checkbox(item.label).checked)).toEqual([true, false, false]);
  });

  it('só com avisos nas checagens, as aprovações ficam habilitadas', () => {
    renderPanel({
      step: 'decisao',
      checks: <ReviewChecks items={warnings} />,
      blocked: false,
      confirmed: allKeys,
    });

    expect(screen.getByText('O link https://x.example não respondeu: HTTP 404')).toBeTruthy();
    for (const button of approvals()) expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('sem content.publish, não há "Marcar todos"', () => {
    renderPanel({ step: 'leitura', canApprove: false });

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
    renderPanel({ step: 'decisao', approve, confirmed: allKeys });

    await userEvent.click(screen.getByRole('button', { name: 'Só aprovar' }));

    // Cada formulário tem o próprio resumo (região viva); a recusa vai ao da aprovação.
    const refusal = await screen.findByText(/não é a mais recente/);
    expect(refusal.closest('[role="alert"]')).not.toBeNull();
  });

  it('versão fora de em revisão mostra o status, sem formulário', () => {
    renderPanel({ step: 'decisao', status: 'rascunho' });

    expect(screen.queryByRole('button', { name: 'Só aprovar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devolver ao editor' })).toBeNull();
    expect(
      screen.getByText(/Esta versão está rascunho: só uma versão em revisão pode ser aprovada/),
    ).toBeTruthy();
  });

  it('com content.publish e a versão em revisão, oferece as quatro decisões', () => {
    renderPanel({ step: 'decisao' });

    for (const name of [...APPROVALS, 'Devolver ao editor']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('publicar na hora diz que o artigo foi ao ar, no cartão e no toast, e tira os formulários', async () => {
    const approvePublish = vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'Versão 2 aprovada: o artigo foi ao ar.' });
    renderPanel({ step: 'decisao', approvePublish, confirmed: allKeys });
    render(<ToastProvider />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar e publicar agora' }));

    expect(approvePublish).toHaveBeenCalledWith();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Versão 2 aprovada: o artigo foi ao ar.'),
    );
    const panel = screen.getByRole('complementary');
    expect(
      within(panel)
        .getByText('Versão 2 aprovada: o artigo foi ao ar.')
        .closest('.bg-success-subtle'),
    ).toBeTruthy();
    expect(panel.querySelector('.bg-warning-subtle')).toBeNull();
    for (const name of [...APPROVALS, 'Devolver ao editor']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('com transbordo, o desfecho diz "agendado para" e o aviso de dia cheio fica no cartão', async () => {
    const message = 'Versão 2 aprovada: o artigo foi agendado para 13/11/2026, 10:00 BRT.';
    const warning = 'O dia pedido já tinha atingido o limite diário de publicações do site.';
    const approvePublish = vi.fn().mockResolvedValue({ ok: true, message, warning });
    renderPanel({ step: 'decisao', approvePublish, confirmed: allKeys });
    render(<ToastProvider />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar e publicar agora' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(`${message} ${warning}`),
    );
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText(message).closest('.bg-success-subtle')).toBeTruthy();
    expect(within(panel).getByText(warning).closest('.bg-warning-subtle')).toBeTruthy();
  });

  it('recusa de publicar vai ao resumo do formulário e as caixas continuam marcadas', async () => {
    const approvePublish = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: [{ path: [], message: 'O site exemplo-a não tem vaga de publicação' }],
    });
    renderPanel({ step: 'decisao', approvePublish, confirmed: allKeys });

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar e publicar agora' }));

    const refusal = await screen.findByText('O site exemplo-a não tem vaga de publicação');
    expect(refusal.closest('[role="alert"]')).not.toBeNull();
    for (const button of approvals()) expect(button.hasAttribute('disabled')).toBe(false);
    await previous();
    for (const item of checklist) expect(checkbox(item.label).checked).toBe(true);
  });

  it('"Aprovar e agendar" abre o Dialog de agendamento; Cancelar fecha sem decidir', async () => {
    const approveSchedule = vi.fn();
    renderPanel({ step: 'decisao', approveSchedule, confirmed: allKeys });

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar e agendar' }));
    expect(screen.getByRole('dialog', { name: 'Agendar publicação' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Agendar publicação' })).toBeNull(),
    );
    expect(approveSchedule).not.toHaveBeenCalled();
  });

  it('devolver exige o comentário: vazio não chama a ação e o erro fica no campo', async () => {
    const giveBack = vi.fn();
    renderPanel({ step: 'decisao', giveBack });

    await userEvent.type(screen.getByRole('textbox', { name: /O que corrigir/ }), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Devolver ao editor' }));

    expect(giveBack).not.toHaveBeenCalled();
    expect(screen.getByText('Escreva o que o editor precisa corrigir.')).toBeTruthy();
  });

  it('com erro nas checagens, devolver continua disponível', () => {
    renderPanel({ step: 'decisao', blocked: true });

    const button = screen.getByRole('button', { name: 'Devolver ao editor' });
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('devolve com o comentário, anuncia no toast e tira os dois formulários', async () => {
    const giveBack = vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'Versão 2 devolvida ao editor.' });
    renderPanel({ step: 'decisao', giveBack });
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
    expect(screen.queryByRole('button', { name: 'Só aprovar' })).toBeNull();
  });

  it('recusa do comentário pelo domínio aparece no campo', async () => {
    const giveBack = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Não foi possível devolver.',
      issues: [{ path: ['comment'], message: 'Escreva o que o editor precisa corrigir.' }],
    });
    renderPanel({ step: 'decisao', giveBack });

    await userEvent.type(screen.getByRole('textbox', { name: /O que corrigir/ }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Devolver ao editor' }));

    const field = screen.getByRole('textbox', { name: /O que corrigir/ });
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
  });
});

describe('próximo da fila depois da decisão (workspace#90)', () => {
  const comment = () =>
    userEvent.type(screen.getByRole('textbox', { name: /O que corrigir/ }), 'Falta a fonte.');
  const decisions = [
    {
      name: 'Só aprovar',
      prop: 'approve',
      message: 'Versão 2 aprovada.',
      before: () => Promise.resolve(),
    },
    {
      name: 'Aprovar e publicar agora',
      prop: 'approvePublish',
      message: 'Versão 2 aprovada: o artigo foi ao ar.',
      before: () => Promise.resolve(),
    },
    {
      name: 'Devolver ao editor',
      prop: 'giveBack',
      message: 'Versão 2 devolvida ao editor.',
      before: comment,
    },
  ] as const;

  it.each(decisions)(
    '$name: depois do toast, vai para revisao/<próximo>',
    async ({ name, prop, message, before }) => {
      const action = vi.fn().mockResolvedValue({ ok: true, message, next: 9 });
      // O toast já está na tela quando a navegação acontece.
      const toastAtPush: (string | null | undefined)[] = [];
      router.push.mockImplementation(() => {
        toastAtPush.push(screen.queryByRole('status')?.textContent);
      });
      renderPanel({ step: 'decisao', confirmed: allKeys, [prop]: action });
      render(<ToastProvider />);

      await before();
      await userEvent.click(screen.getByRole('button', { name }));

      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sites/exemplo-a/revisao/9'));
      expect(router.push).toHaveBeenCalledOnce();
      expect(toastAtPush).toEqual([message]);
      expect(screen.queryByText('A fila de revisão acabou.')).toBeNull();
    },
  );

  it.each(decisions)(
    '$name: com a fila vazia, diz que ela acabou, com o link para a fila, e não navega',
    async ({ name, prop, message, before }) => {
      const action = vi.fn().mockResolvedValue({ ok: true, message, next: null });
      renderPanel({ step: 'decisao', confirmed: allKeys, [prop]: action });

      await before();
      await userEvent.click(screen.getByRole('button', { name }));

      const panel = screen.getByRole('complementary');
      expect(await within(panel).findByText('A fila de revisão acabou.')).toBeTruthy();
      expect(
        within(panel).getByRole('link', { name: 'Voltar à fila de revisão' }).getAttribute('href'),
      ).toBe('/sites/exemplo-a/revisao');
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it.each(decisions)(
    '$name: recusa do domínio não navega e fica no resumo de erros',
    async ({ name, prop, before }) => {
      const action = vi.fn().mockResolvedValue({
        ok: false,
        message: 'Não foi possível decidir.',
        issues: [{ path: [], message: 'A versão 2 não está em revisão' }],
      });
      renderPanel({ step: 'decisao', confirmed: allKeys, [prop]: action });

      await before();
      await userEvent.click(screen.getByRole('button', { name }));

      const refusal = await screen.findByText('A versão 2 não está em revisão');
      expect(refusal.closest('[role="alert"]')).not.toBeNull();
      expect(router.push).not.toHaveBeenCalled();
      expect(screen.queryByText('A fila de revisão acabou.')).toBeNull();
      expect(screen.getByRole('button', { name })).toBeTruthy();
    },
  );
});
