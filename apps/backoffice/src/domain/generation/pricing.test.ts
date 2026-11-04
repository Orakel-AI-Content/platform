import { describe, expect, it } from 'vitest';

import { PricingTableSchema, costUsd } from './pricing.ts';

const table = PricingTableSchema.parse({
  'anthropic:claude-haiku-5-5': { input: 0.1, output: 0.5 },
});

describe('costUsd', () => {
  it('soma entrada e saída pelo preço por milhão de tokens do modelo', () => {
    const cost = costUsd(table, 'anthropic:claude-haiku-5-5', {
      inputTokens: 2_000,
      outputTokens: 4_000,
    });
    // 2.000 × 0,10/1M + 4.000 × 0,50/1M = 0,0002 + 0,002
    expect(cost).toBeCloseTo(0.0022, 10);
  });

  it('sem tokens, custo zero', () => {
    expect(costUsd(table, 'anthropic:claude-haiku-5-5', { inputTokens: 0, outputTokens: 0 })).toBe(
      0,
    );
  });

  it('modelo fora da tabela dá custo nulo, não erro', () => {
    expect(costUsd(table, 'fixture', { inputTokens: 10, outputTokens: 10 })).toBeNull();
  });

  it('recusa preço negativo na tabela', () => {
    expect(PricingTableSchema.safeParse({ x: { input: -1, output: 0 } }).success).toBe(false);
  });
});
