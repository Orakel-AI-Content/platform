import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { PageHeader } from '@/components/shared/PageHeader';
import { sitesTrail } from '@/components/shared/trail.ts';
import Button from '@/components/ui/Button';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Input from '@/components/ui/Input';

import { COLOR_SCHEMES, focusRing, outline, setTheme, tabTo } from '../../../test/browser/a11y.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Moldura do admin em Chromium (#476; antes no E2E, `header.spec.ts` e `focus.spec.ts`, #85,
// #170): a primeira parada do Tab é "Pular para o conteúdo", que leva o foco ao <main>, e o
// próximo Tab já é do conteúdo; navegando só com Tab, link, campo e botão mostram o contorno
// --ring de 2px da regra global de `globals.css`, nos dois temas. A fixture é um formulário de
// tela de item: trilha, campo e botão.

function AuthorForm() {
  return (
    <>
      <PageHeader
        id="titulo"
        trail={sitesTrail([
          { label: 'Autores', href: '/sites/exemplo-a/autores' },
          { label: 'Criar autor' },
        ])}
        title="Criar autor"
      />
      <FormContainer>
        <FormItem label="Nome" htmlFor="nome" asterisk>
          <Input id="nome" name="nome" />
        </FormItem>
        <Button type="button">Criar</Button>
      </FormContainer>
    </>
  );
}

const skipLink = () => page.getByRole('link', { name: 'Pular para o conteúdo' });
const main = () => page.getByRole('main');

beforeEach(() => {
  navigation.set('/sites/exemplo-a/autores/novo');
});

afterEach(() => {
  navigation.set('/');
});

describe('moldura do admin no navegador', () => {
  it('a primeira parada do Tab é "Pular para o conteúdo", que leva o foco ao <main>', async () => {
    await renderInFrame(<AuthorForm />);
    (document.activeElement as HTMLElement | null)?.blur();

    await userEvent.keyboard('{Tab}');
    await expect.element(skipLink()).toHaveFocus();
    await expect.element(skipLink()).toBeInViewport();

    await userEvent.keyboard('{Enter}');
    await expect.element(main()).toHaveFocus();
    // O Tab seguinte já é do conteúdo, não do cabeçalho.
    await userEvent.keyboard('{Tab}');
    expect(main().element().contains(document.activeElement)).toBe(true);
  });

  it.each(COLOR_SCHEMES)(
    'link, campo e botão mostram o contorno --ring ao receber foco pelo teclado (%s)',
    async (scheme) => {
      await setTheme(scheme);
      await renderInFrame(<AuthorForm />);

      for (const target of [
        skipLink(),
        main().getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').first(),
        main().getByRole('textbox', { name: /^Nome/ }),
        main().getByRole('button', { name: 'Criar', exact: true }),
      ]) {
        await tabTo(target);
        // O Input do Ecme (#245) tem `transition`, que no Tailwind 4 inclui `outline-color`: a
        // cor chega ao --ring depois da transição.
        await expect.poll(() => outline(target)).toEqual(focusRing());
      }
    },
  );
});
