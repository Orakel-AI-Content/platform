import { describe, expect, it } from 'vitest';

import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from './sectionText.ts';

// As duas classes de texto das seções definem cor nos dois temas.

describe.each([
  ['título', SECTION_TITLE_CLASS],
  ['dica', SECTION_HINT_CLASS],
])('%s de seção', (_, className) => {
  it('tem cor no tema claro e no escuro', () => {
    const classes = className.split(' ');
    expect(classes.some((name) => name.startsWith('text-gray-'))).toBe(true);
    expect(classes.some((name) => name.startsWith('dark:text-gray-'))).toBe(true);
  });
});
