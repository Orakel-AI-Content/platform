import { describe, expect, it } from 'vitest';
import { resolveTokens } from './resolve.ts';

const black = { colorSpace: 'srgb', components: [0, 0, 0] };
const px = (value: number) => ({ value, unit: 'px' });

function codes(document: unknown) {
  const result = resolveTokens(document);
  return result.ok ? [] : result.issues.map((issue) => `${issue.path} ${issue.code}`);
}

describe('resolveTokens', () => {
  it('herda o $type do grupo e resolve aliases em cadeia', () => {
    const result = resolveTokens({
      palette: { $type: 'color', ink: { $value: black } },
      color: {
        $type: 'color',
        text: { $value: '{palette.ink}' },
        strong: { $value: '{color.text}' },
      },
      font: { size: { $type: 'dimension', md: { $value: { value: 1, unit: 'rem' } } } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.get('color.strong')).toEqual({
      path: 'color.strong',
      type: 'color',
      value: black,
    });
    expect(result.value.get('font.size.md')?.type).toBe('dimension');
  });

  it('um alias sem $type assume o tipo do alvo', () => {
    const result = resolveTokens({
      palette: { ink: { $type: 'color', $value: black } },
      color: { text: { $value: '{palette.ink}' } },
    });
    expect(result.ok && result.value.get('color.text')?.type).toBe('color');
  });

  it('resolve aliases nos campos da sombra', () => {
    const result = resolveTokens({
      palette: { $type: 'color', ink: { $value: black } },
      shadow: {
        $type: 'shadow',
        sm: {
          $value: {
            color: '{palette.ink}',
            offsetX: px(0),
            offsetY: px(1),
            blur: px(2),
            spread: px(0),
          },
        },
      },
    });
    expect(result.ok && result.value.get('shadow.sm')?.value).toMatchObject({ color: black });
  });

  it('aponta alias inexistente, ciclo e tipo diferente, todos de uma vez', () => {
    expect(
      codes({
        color: {
          $type: 'color',
          a: { $value: '{color.nada}' },
          b: { $value: '{color.c}' },
          c: { $value: '{color.b}' },
        },
        size: { $type: 'dimension', x: { $value: '{palette.ink}' } },
        palette: { ink: { $type: 'color', $value: black } },
      }),
    ).toEqual([
      'color.a alias.missing',
      // O ciclo é apontado no token que o fecha.
      'color.c alias.cycle',
      'size.x alias.type-mismatch',
    ]);
  });

  it('valida o valor pelo tipo, incluindo o hex contra os componentes', () => {
    expect(
      codes({
        color: {
          $type: 'color',
          a: { $value: '#ffffff' },
          b: { $value: { ...black, hex: '#ffffff' } },
          c: { $value: { colorSpace: 'display-p3', components: [0, 0, 0] } },
        },
        space: { $type: 'dimension', x: { $value: { value: 1, unit: 'em' } } },
      }),
    ).toEqual([
      'color.a schema.invalid_type',
      'color.b.hex schema.custom',
      'color.c.colorSpace schema.invalid_value',
      'space.x.unit schema.invalid_value',
    ]);
  });

  it('aponta $type desconhecido, token sem tipo e nomes inválidos', () => {
    expect(
      codes({
        a: { $type: 'gradient', x: { $value: 1 } },
        b: { $value: 1 },
        'c.d': { $value: 1, $type: 'number' },
        e: 3,
      }),
    ).toEqual([
      'a type.unsupported',
      'c.d name.invalid',
      'e structure.invalid',
      'a.x type.missing',
      'b type.missing',
    ]);
  });
});
