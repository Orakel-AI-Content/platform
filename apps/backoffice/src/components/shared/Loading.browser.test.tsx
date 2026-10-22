import { describe, expect, it } from 'vitest';

import { renderUi } from '../../../test/browser/render.tsx';
import { Skeleton } from '../ui/Skeleton';
import Loading from './Loading.tsx';
import MediaSkeleton from './loaders/MediaSkeleton.tsx';
import TextBlockSkeleton from './loaders/TextBlockSkeleton.tsx';

// Loading e Skeleton em Chromium (#457; da vitrine, #206): o Loading anuncia o carregamento
// e o Skeleton fica fora da árvore acessível.

describe('Loading e Skeleton no navegador', () => {
  it('Loading anuncia o carregamento e o Skeleton fica fora da árvore acessível', async () => {
    const screen = await renderUi(
      <>
        <div data-skeletons="">
          <Skeleton width="60%" />
          <MediaSkeleton />
          <TextBlockSkeleton rowCount={2} />
        </div>
        <section aria-label="Carregamento">
          <Loading loading className="h-24">
            Conteúdo carregado
          </Loading>
          <Loading type="cover" loading>
            <p>Lista por baixo da sobreposição.</p>
          </Loading>
        </section>
      </>,
    );
    const loading = screen.getByRole('region', { name: 'Carregamento' });

    // Default e cover: os dois anunciam "Carregando…" em role="status".
    expect(
      loading
        .getByRole('status')
        .elements()
        .map((status) => status.textContent),
    ).toEqual(['Carregando…', 'Carregando…']);
    expect(loading.element().querySelector('[aria-busy="true"]')?.textContent).toContain(
      'Lista por baixo da sobreposição.',
    );

    const skeletons = screen.container.querySelector('[data-skeletons]')!;
    const blocks = [...skeletons.querySelectorAll('.skeleton')];
    expect(blocks.length).toBeGreaterThanOrEqual(6);
    for (const block of blocks) expect(block.getAttribute('aria-hidden')).toBe('true');
    // Nada exposto ao leitor de tela: sem texto e sem papel fora do que é aria-hidden.
    expect(skeletons.textContent?.trim()).toBe('');
    expect(
      [...skeletons.querySelectorAll('[role]')].filter(
        (element) => !element.closest('[aria-hidden="true"]'),
      ),
    ).toEqual([]);
  });
});
