import { describe, expect, it } from 'vitest';

import { COLOR_SCHEMES, outline, setTheme, tabTo } from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Button } from '../Button';
import { FormContainer, FormItem } from '../Form';
import { InputGroup } from '../InputGroup';
import { Input } from './index.tsx';

// Input, textarea e InputGroup em Chromium (#457; da vitrine, #207): rótulo do FormItem e
// contorno de foco de 2px pelo Tab, nos dois temas.

function Fields() {
  return (
    <>
      <section aria-label="Input">
        <FormContainer className="form-width">
          <FormItem label="Título">
            <Input placeholder="Título do artigo" />
          </FormItem>
          <FormItem label="Resumo">
            <Input textArea placeholder="Duas ou três frases" />
          </FormItem>
          <FormItem label="Preço">
            <Input prefix="R$" suffix=",00" inputMode="numeric" />
          </FormItem>
          <FormItem label="Desabilitado">
            <Input disabled placeholder="Indisponível" />
          </FormItem>
        </FormContainer>
      </section>
      <section aria-label="InputGroup">
        <FormContainer className="form-width">
          <FormItem label="Domínio">
            <InputGroup>
              <InputGroup.Addon>https://</InputGroup.Addon>
              <Input placeholder="exemplo" />
              <InputGroup.Addon>.com.br</InputGroup.Addon>
            </InputGroup>
          </FormItem>
          <FormItem label="Busca">
            <InputGroup size="sm">
              <Input placeholder="Termo" />
              <Button>Buscar</Button>
            </InputGroup>
          </FormItem>
        </FormContainer>
      </section>
    </>
  );
}

describe.each(COLOR_SCHEMES)('Input no navegador (%s)', (scheme) => {
  it('Input, textarea e InputGroup focáveis por Tab, com contorno de 2px', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Fields />);
    const inputs = screen.getByRole('region', { name: 'Input', exact: true });
    const group = screen.getByRole('region', { name: 'InputGroup' });

    await expect.element(inputs.getByLabelText('Título')).toHaveAttribute('type', 'text');
    expect(inputs.getByLabelText('Resumo').element().tagName).toBe('TEXTAREA');
    await expect.element(inputs.getByLabelText('Desabilitado')).toBeDisabled();
    expect(group.element().querySelector('.input-group')?.textContent).toBe('https://.com.br');
    await expect.element(group.getByLabelText('Domínio')).toBeVisible();

    for (const field of [
      inputs.getByLabelText('Título'),
      inputs.getByLabelText('Resumo'),
      group.getByLabelText('Domínio'),
    ]) {
      await tabTo(field);
      const { style, width } = outline(field);
      expect({ style, width }).toEqual({ style: 'solid', width: '2px' });
    }
  });
});
