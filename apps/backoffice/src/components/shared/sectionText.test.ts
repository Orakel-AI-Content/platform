import { describe, expect, it } from 'vitest';

import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from './sectionText.ts';

// O título de seção define cor nos dois temas; a dica herda a do body (#398).

describe('texto de seção', () => {
  it('o título tem cor no tema claro e no escuro', () => {
    const classes = SECTION_TITLE_CLASS.split(' ');
    expect(classes.some((name) => name.startsWith('text-gray-'))).toBe(true);
    expect(classes.some((name) => name.startsWith('dark:text-gray-'))).toBe(true);
  });

  it('a dica não tem cor própria', () => {
    expect(SECTION_HINT_CLASS.split(' ').some((name) => /^(dark:)?text-gray-/.test(name))).toBe(
      false,
    );
  });
});
