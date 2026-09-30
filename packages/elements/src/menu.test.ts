import { describe, expect, it } from 'vitest';

import { mount } from './test-dom.ts';

const HTML = `
  <p id="fora">Fora</p>
  <ok-menu>
    <details open><summary>Menu</summary><nav><a href="/x/">X</a></nav></details>
  </ok-menu>`;

const details = () => document.querySelector('details')!;

describe('<ok-menu>', () => {
  it('Esc fecha e devolve o foco ao summary', async () => {
    await mount(HTML);
    document.querySelector<HTMLAnchorElement>('a')!.focus();
    document
      .querySelector('a')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(details().open).toBe(false);
    expect(document.activeElement).toBe(document.querySelector('summary'));
  });

  it('outras teclas não fecham', async () => {
    await mount(HTML);
    details().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(details().open).toBe(true);
  });

  it('clique fora fecha; clique dentro não', async () => {
    await mount(HTML);
    document.querySelector('nav')!.click();
    expect(details().open).toBe(true);
    document.querySelector<HTMLElement>('#fora')!.click();
    expect(details().open).toBe(false);
  });

  it('sem <details>, não faz nada', async () => {
    await mount('<ok-menu><nav></nav></ok-menu>');
    expect(() => {
      document.body.click();
    }).not.toThrow();
  });
});
