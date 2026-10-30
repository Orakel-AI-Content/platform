import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';

import { StateTag } from '@/components/sites/SiteStatus';
import { Card } from '@/components/ui/Card';

import { audit, COLOR_SCHEMES, setTheme } from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';
import { InfoField, InfoList } from './InfoList.tsx';
import { PageMeta } from './PageMeta.tsx';

// Lista de dados e linha de metadados em Chromium (#459; da vitrine, #368): o `CustomerInfoField`
// do Ecme, com o rótulo em cima e o valor embaixo. A 375 px, o valor de 120 caracteres sem
// espaço nem hífen (o pior caso de slug ou URL) quebra dentro do cartão, e nada da seção passa
// da janela.

const LONG_VALUE = 'guiacompleto'.repeat(10);

function DataList() {
  return (
    <section aria-label="Lista de dados e linha de metadados" className="space-y-3 px-4">
      <PageMeta
        items={[
          <StateTag key="estado" color="bg-success">
            Publicado
          </StateTag>,
          'Versão 3',
          'Atualizada em 01/10/2026, 12:30 BRT',
        ]}
      />
      <Card>
        <InfoList className="sm:grid-cols-2">
          <InfoField label="Domínio">exemplo-a.test</InfoField>
          <InfoField label="Identificador" className="tabular-nums">
            42
          </InfoField>
          <InfoField label="Slug">
            <span data-valor-longo="">{LONG_VALUE}</span>
          </InfoField>
          <InfoField label="Status">
            <StateTag color="bg-warning">Em revisão</StateTag>
          </InfoField>
        </InfoList>
      </Card>
    </section>
  );
}

describe.each(COLOR_SCHEMES)('lista de dados no navegador (%s)', (scheme) => {
  it('quebra o valor longo a 375 px, sem violação do axe', async () => {
    await page.viewport(375, 800);
    await setTheme(scheme);
    const screen = await renderUi(<DataList />);
    const section = screen.getByRole('region', { name: 'Lista de dados e linha de metadados' });

    expect(
      section
        .getByRole('term')
        .elements()
        .map((term) => term.textContent),
    ).toEqual(['Domínio', 'Identificador', 'Slug', 'Status']);
    await expect.element(section.getByText('Publicado')).toBeVisible();

    // O valor longo ocupa várias linhas, dentro da largura do cartão.
    const value = section.element().querySelector<HTMLElement>('[data-valor-longo]')!;
    expect(value.textContent).toBe(LONG_VALUE);
    const valueBox = value.getBoundingClientRect();
    const listBox = section.element().querySelector('dl')!.getBoundingClientRect();
    expect(valueBox.right).toBeLessThanOrEqual(listBox.right + 1);
    expect(valueBox.height).toBeGreaterThan(
      Number.parseFloat(getComputedStyle(value).lineHeight) * 1.5,
    );

    // Nada da seção passa da janela.
    const element = section.element();
    const right = Math.max(
      element.getBoundingClientRect().right,
      ...[...element.querySelectorAll('*')].map((child) => child.getBoundingClientRect().right),
    );
    expect(right).toBeLessThanOrEqual(375);
    expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);

    expect(await audit(screen.container)).toEqual([]);
  });
});
