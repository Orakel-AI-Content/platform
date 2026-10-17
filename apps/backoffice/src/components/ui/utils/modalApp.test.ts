// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { APP_ELEMENT_ID, holdAppInert } from './modalApp.ts';

// `inert` do contêiner da app por contador (#209): sai só quando o último diálogo fecha.

afterEach(() => {
  document.body.innerHTML = '';
});

describe('holdAppInert', () => {
  it('liga o inert e o desliga ao soltar', () => {
    document.body.innerHTML = `<div id="${APP_ELEMENT_ID}"></div>`;
    const app = document.getElementById(APP_ELEMENT_ID)!;

    const release = holdAppInert();
    expect(app.inert).toBe(true);
    release();
    expect(app.inert).toBe(false);
  });

  it('com dois diálogos, fechar um mantém o inert; soltar duas vezes não desconta de novo', () => {
    document.body.innerHTML = `<div id="${APP_ELEMENT_ID}"></div>`;
    const app = document.getElementById(APP_ELEMENT_ID)!;

    const drawer = holdAppInert();
    const confirm = holdAppInert();
    confirm();
    confirm();
    expect(app.inert).toBe(true);
    drawer();
    expect(app.inert).toBe(false);
  });

  it('sem o contêiner na página, não quebra', () => {
    const release = holdAppInert();
    expect(() => release()).not.toThrow();
  });
});
