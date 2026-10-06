import {
  AuthorSchema,
  FaqBlockSchema,
  ImageBlockSchema,
  InstitutionalTextsSchema,
} from '@orakel/content-model/v1';
import { describe as group, expect, it } from 'vitest';
import * as z from 'zod';

import { clean, describe, emptyValue, pattern } from './schema-walk.ts';

group('leitura do schema', () => {
  it('desembrulha opcional e identifica os tipos', () => {
    const shape = AuthorSchema.shape;
    expect(describe(shape.slug)).toEqual({ optional: false, node: { kind: 'string' } });
    expect(describe(shape.bio)).toEqual({ optional: true, node: { kind: 'string' } });
    expect(describe(shape.avatarMediaId)).toEqual({ optional: true, node: { kind: 'number' } });
    expect(describe(z.enum(['a', 'b'])).node).toEqual({ kind: 'enum', options: ['a', 'b'] });
    expect(describe(FaqBlockSchema.shape.type).node).toEqual({ kind: 'literal', value: 'faq' });
    expect(describe(FaqBlockSchema.shape.items).node.kind).toBe('array');
    // Rich text: lista de união, sem desenho padrão para o item.
    const answer = describe(FaqBlockSchema.shape.items).node;
    if (answer.kind !== 'array') throw new Error('esperava lista');
    const item = describe(answer.element).node;
    if (item.kind !== 'object') throw new Error('esperava objeto');
    const inlines = describe(item.shape.answer as z.ZodType).node;
    if (inlines.kind !== 'array') throw new Error('esperava lista');
    expect(describe(inlines.element).node.kind).toBe('unknown');
  });

  it('objeto com superRefine continua com shape', () => {
    expect(describe(ImageBlockSchema).node.kind).toBe('object');
  });

  it('pattern troca índices por *', () => {
    expect(pattern('items.0.answer')).toBe('items.*.answer');
    expect(pattern('items.12.answer.3')).toBe('items.*.answer.*');
    expect(pattern('title')).toBe('title');
  });

  it('valor inicial de um item de FAQ', () => {
    const items = describe(FaqBlockSchema.shape.items).node;
    if (items.kind !== 'array') throw new Error('esperava lista');
    expect(emptyValue(items.element)).toEqual({ question: '', answer: [] });
  });

  it('clean: string opcional vazia e número vazio viram undefined', () => {
    expect(
      clean(ImageBlockSchema, {
        n: 1,
        type: 'image',
        mediaId: Number.NaN,
        alt: '  ',
        decorative: false,
      }),
    ).toEqual({ n: 1, type: 'image', mediaId: undefined, alt: undefined, decorative: false });
    expect(clean(AuthorSchema, { slug: '', name: '' })).toEqual({ slug: '', name: '' });
  });

  it('clean: lista vazia em campo opcional vira undefined; em obrigatório, fica', () => {
    expect(
      clean(InstitutionalTextsSchema, { about: [], terms: [{ type: 'paragraph', children: [] }] }),
    ).toEqual({ about: undefined, terms: [{ type: 'paragraph', children: [] }] });
    expect(clean(FaqBlockSchema, { n: 1, type: 'faq', items: [] })).toEqual({
      n: 1,
      type: 'faq',
      items: [],
    });
  });
});
