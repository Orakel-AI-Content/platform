import { afterEach, describe, expect, it, vi } from 'vitest';

import { mount, setScroll } from './test-dom.ts';

const HTML = `
  <ok-carousel>
    <ul data-ok-track id="trilha"><li>1</li><li>2</li><li>3</li></ul>
    <button type="button" data-ok-prev hidden>Anterior</button>
    <button type="button" data-ok-next hidden>Próximo</button>
  </ok-carousel>`;

function parts() {
  const track = document.querySelector<HTMLElement>('[data-ok-track]')!;
  const prev = document.querySelector<HTMLButtonElement>('[data-ok-prev]')!;
  const next = document.querySelector<HTMLButtonElement>('[data-ok-next]')!;
  return { track, prev, next };
}

afterEach(() => vi.unstubAllGlobals());

describe('<ok-carousel>', () => {
  it('mostra os botões ligados à trilha e desabilita a ponta inicial', async () => {
    await mount(HTML);
    const { prev, next } = parts();
    expect(prev.hidden).toBe(false);
    expect(next.getAttribute('aria-controls')).toBe('trilha');
    expect(prev.disabled).toBe(true);
  });

  it('rola um item por clique e atualiza as pontas com a rolagem', async () => {
    await mount(HTML);
    const { track, prev, next } = parts();
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy as typeof track.scrollBy;
    setScroll(track, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
    track.dispatchEvent(new Event('scroll'));

    next.click();
    expect(scrollBy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });

    setScroll(track, { scrollWidth: 900, clientWidth: 300, scrollLeft: 600 });
    track.dispatchEvent(new Event('scroll'));
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);

    prev.click();
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -300, behavior: 'smooth' });
  });

  it('sem animação para quem pediu menos movimento', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    await mount(HTML);
    const { track, next } = parts();
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy as typeof track.scrollBy;
    setScroll(track, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
    track.dispatchEvent(new Event('scroll'));
    next.click();
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('sem a trilha, deixa os botões ocultos (degrau 1 intacto)', async () => {
    await mount(
      '<ok-carousel><button data-ok-prev hidden></button><button data-ok-next hidden></button></ok-carousel>',
    );
    expect(document.querySelector<HTMLButtonElement>('[data-ok-prev]')!.hidden).toBe(true);
  });

  it('solta os listeners ao sair do documento', async () => {
    await mount(HTML);
    const { track, next } = parts();
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy as typeof track.scrollBy;
    document.querySelector('ok-carousel')!.remove();
    next.click();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
