// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Input } from '../Input/index.tsx';
import { Form, FormContainer, FormItem } from './index.tsx';

// Form do Ecme (#207): só layout e contexto (rótulo, mensagem, tamanho). O rótulo e a mensagem
// de erro ficam ligados ao campo pelo contexto do FormItem, sem repassar ids à mão.

afterEach(cleanup);

// O happy-dom rejeita a animação nativa que o motion cancela ao desmontar; aqui a mensagem
// entra sem animação (o movimento fica para o E2E da vitrine).
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

describe('FormItem', () => {
  it('liga o rótulo ao Input sem htmlFor', () => {
    render(
      <FormItem label="Título">
        <Input />
      </FormItem>,
    );

    const input = screen.getByLabelText('Título');
    expect(input.tagName).toBe('INPUT');
    expect(input.id).toMatch(/-control$/);
  });

  it('com htmlFor, o rótulo aponta para o id dado, que o Input também usa', () => {
    render(
      <FormItem label="Slug" htmlFor="slug">
        <Input />
      </FormItem>,
    );

    expect(screen.getByLabelText('Slug').id).toBe('slug');
  });

  it('o id próprio do Input vence o do FormItem só com htmlFor igual', () => {
    render(
      <FormItem label="Resumo" htmlFor="resumo">
        <Input id="resumo" textArea />
      </FormItem>,
    );

    expect(screen.getByLabelText('Resumo').tagName).toBe('TEXTAREA');
  });

  it('inválido: aria-invalid e aria-describedby apontando para a mensagem', () => {
    render(
      <FormItem label="E-mail" invalid errorMessage="Informe um e-mail válido">
        <Input aria-describedby="dica" />
      </FormItem>,
    );

    const input = screen.getByLabelText('E-mail');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.className).toContain('input-invalid');
    const [hint, errorId] = input.getAttribute('aria-describedby')!.split(' ');
    expect(hint).toBe('dica');
    expect(document.getElementById(errorId!)?.textContent).toBe('Informe um e-mail válido');
    expect(screen.getByText('Informe um e-mail válido').className).toContain('form-explain');
    expect(screen.getByText('Informe um e-mail válido').getAttribute('aria-live')).toBe('polite');
  });

  it('válido: sem aria-invalid, sem mensagem e sem o id dela no aria-describedby', () => {
    render(
      <FormItem label="E-mail" errorMessage="Informe um e-mail válido">
        <Input aria-describedby="dica" />
      </FormItem>,
    );

    const input = screen.getByLabelText('E-mail');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.getAttribute('aria-describedby')).toBe('dica');
    expect(screen.queryByText('Informe um e-mail válido')).toBeNull();
  });

  it('asterisco em text-error e oculto do leitor de tela', () => {
    render(
      <FormItem label="Nome" asterisk>
        <Input required />
      </FormItem>,
    );

    const asterisk = screen.getByText('*');
    expect(asterisk.className).toContain('text-error');
    expect(asterisk.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByLabelText(/Nome/)).toHaveProperty('required', true);
  });

  it('layout horizontal: dois-pontos no rótulo e largura mínima do contexto', () => {
    render(
      <FormContainer layout="horizontal" labelWidth={140}>
        <FormItem label="Site">
          <Input />
        </FormItem>
      </FormContainer>,
    );

    const label = screen.getByText(/Site/).closest('label')!;
    expect(label.textContent).toBe('Site:');
    expect(label.style.minWidth).toBe('140px');
    expect(label.closest('.form-item')?.className).toContain('horizontal');
  });
});

describe('Form e FormContainer', () => {
  it('Form renderiza <form> com o container no layout dado e o tamanho para os campos', () => {
    render(
      <Form aria-label="Busca" layout="inline" size="sm" containerClassName="gap-2">
        <FormItem label="Termo">
          <Input />
        </FormItem>
      </Form>,
    );

    const form = screen.getByRole('form', { name: 'Busca' });
    const container = form.firstElementChild!;
    expect(container.className).toContain('form-container');
    expect(container.className).toContain('inline');
    expect(container.className).toContain('gap-2');
    // Tamanho sm do Form: 40 px de altura no Input.
    expect(screen.getByLabelText(/Termo/).className).toContain('h-10');
  });

  it('FormContainer vertical e md por padrão', () => {
    render(
      <FormContainer>
        <FormItem label="Título">
          <Input />
        </FormItem>
      </FormContainer>,
    );

    expect(screen.getByLabelText('Título').closest('.form-container')?.className).toContain(
      'vertical',
    );
    expect(screen.getByLabelText('Título').className).toContain('h-12');
  });
});
