// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '../toast/index.ts';
import { Upload } from './index.tsx';

// Upload do Ecme (#320): o <input type="file"> nativo é o alvo do clique, do teclado e de soltar,
// com nome acessível; a lista mostra cada arquivo com um botão "Remover <arquivo>".

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:previa');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
});

const arquivo = (name: string, type = 'text/plain', size = 2048) =>
  new File(['x'.repeat(size)], name, { type });

describe('Upload', () => {
  it('sem draggable: o botão "Escolher arquivo" abre o seletor do input rotulado', async () => {
    render(<Upload />);

    const input = screen.getByLabelText<HTMLInputElement>('Escolher arquivo', {
      selector: 'input',
    });
    expect(input.type).toBe('file');
    const click = vi.spyOn(input, 'click');
    await userEvent.click(screen.getByRole('button', { name: 'Escolher arquivo' }));
    expect(click).toHaveBeenCalledOnce();
  });

  it('desabilitado: o botão não abre o seletor', () => {
    render(<Upload disabled />);

    const input = screen.getByLabelText('Escolher arquivo', { selector: 'input' });
    const click = vi.spyOn(input, 'click');
    fireEvent.click(input.parentElement!);
    expect(click).not.toHaveBeenCalled();
    expect(input).toHaveProperty('disabled', true);
  });

  it('draggable: o input cobre a área, entra no Tab e tem o texto da área como nome', async () => {
    render(<Upload draggable />);

    await userEvent.tab();
    const input = screen.getByLabelText('Escolha um arquivo ou arraste e solte aqui');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('type')).toBe('file');
    expect(input.closest('.upload-draggable')).not.toBeNull();
  });

  it('draggable com conteúdo próprio: o nome vem do conteúdo, ou do aria-label', () => {
    const { rerender } = render(
      <Upload draggable>
        <p>Solte a imagem de capa</p>
      </Upload>,
    );
    expect(screen.getByLabelText('Solte a imagem de capa', { selector: 'input' })).toBeDefined();

    rerender(
      <Upload draggable aria-label="Capa do artigo">
        <p>Solte aqui</p>
      </Upload>,
    );
    expect(screen.getByLabelText('Capa do artigo', { selector: 'input' })).toBeDefined();
  });

  it('arrastar sobre a área a destaca em primary; sair ou soltar tira o destaque', () => {
    render(<Upload draggable />);

    const area = screen.getByLabelText('Escolha um arquivo ou arraste e solte aqui').parentElement!;
    fireEvent.dragOver(area);
    expect(area.className).toContain('border-primary');
    fireEvent.dragLeave(area);
    expect(area.className).not.toMatch(/(^| )border-primary( |$)/);
    fireEvent.dragOver(area);
    fireEvent.drop(area);
    expect(area.className).not.toMatch(/(^| )border-primary( |$)/);
  });

  it('escolher arquivos lista cada um e chama onChange com a lista nova e a anterior', async () => {
    const onChange = vi.fn();
    render(<Upload draggable multiple onChange={onChange} />);

    const input = screen.getByLabelText('Escolha um arquivo ou arraste e solte aqui');
    const pauta = arquivo('pauta.txt');
    const capa = arquivo('capa.zip', 'application/zip');
    await userEvent.upload(input, [pauta, capa]);

    expect(onChange).toHaveBeenLastCalledWith([pauta, capa], []);
    expect(screen.getByText('pauta.txt')).toBeDefined();
    expect(screen.getByText('capa.zip')).toBeDefined();
    expect(screen.getAllByText('2 kb')).toHaveLength(2);
  });

  it('remover tem o nome do arquivo, tira só ele e chama onFileRemove', async () => {
    const onFileRemove = vi.fn();
    const pauta = arquivo('pauta.txt');
    const capa = arquivo('capa.pdf', 'application/pdf');
    render(<Upload fileList={[pauta, capa]} onFileRemove={onFileRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remover pauta.txt' }));
    expect(onFileRemove).toHaveBeenLastCalledWith([capa]);
    expect(screen.queryByText('pauta.txt')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover capa.pdf' })).toBeDefined();
  });

  it('ícones de arquivo ficam fora da árvore de acessibilidade; imagem tem prévia com alt', () => {
    render(
      <Upload
        fileList={[
          arquivo('a.pdf', 'application/pdf'),
          arquivo('b.zip', 'application/zip'),
          arquivo('c.txt'),
          arquivo('d.png', 'image/png'),
        ]}
      />,
    );

    const icons = document.querySelectorAll('.upload-file-thumbnail svg');
    expect(icons).toHaveLength(3);
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('img', { name: 'Prévia de d.png' })).toBeDefined();
  });

  it('uploadLimit 1 troca o arquivo; acima do limite não acrescenta', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Upload uploadLimit={1} onChange={onChange} />);
    const input = screen.getByLabelText('Escolher arquivo', { selector: 'input' });
    const primeiro = arquivo('primeiro.txt');
    const segundo = arquivo('segundo.txt');

    await userEvent.upload(input, primeiro);
    await userEvent.upload(input, segundo);
    expect(onChange).toHaveBeenLastCalledWith([segundo], [primeiro]);
    expect(screen.queryByText('primeiro.txt')).toBeNull();

    rerender(<Upload uploadLimit={2} multiple onChange={onChange} />);
    await userEvent.upload(input, arquivo('terceiro.txt'));
    expect(onChange).toHaveBeenLastCalledWith(
      [segundo, expect.objectContaining({ name: 'terceiro.txt' })],
      [segundo],
    );
    await userEvent.upload(input, arquivo('quarto.txt'));
    expect(screen.queryByText('quarto.txt')).toBeNull();
  });

  it('beforeUpload recusando avisa por toast e não acrescenta', async () => {
    const onChange = vi.fn();
    render(
      <>
        <ToastProvider />
        <Upload
          beforeUpload={(files) => (files?.[0]?.size ?? 0) < 1000 || 'Arquivo acima de 1 kb.'}
          onChange={onChange}
        />
        <Upload beforeUpload={() => false} aria-label="Sempre recusa" />
      </>,
    );

    await userEvent.upload(
      screen.getByLabelText('Escolher arquivo', { selector: 'input' }),
      arquivo('grande.txt'),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByText('Arquivo acima de 1 kb.')).toBeDefined();

    await userEvent.upload(
      screen.getByLabelText('Sempre recusa', { selector: 'input' }),
      arquivo('x.txt'),
    );
    expect(await screen.findByText('Não foi possível adicionar o arquivo.')).toBeDefined();
    expect(screen.queryByText('x.txt')).toBeNull();
  });

  it('showList false esconde a lista; id fica só na área', async () => {
    render(<Upload id="capa" showList={false} />);

    const input = screen.getByLabelText('Escolher arquivo', { selector: 'input' });
    await userEvent.upload(input, arquivo('pauta.txt'));
    expect(screen.queryByText('pauta.txt')).toBeNull();
    expect(document.querySelectorAll('#capa')).toHaveLength(1);
    expect(input.id).toBe('');
    expect(within(document.getElementById('capa')!).getByRole('button')).toBeDefined();
  });
});
