import * as z from 'zod';

/**
 * Tabela de preços da geração (RN-CON-10), por modelo no formato de `LLM_MODEL`
 * (`anthropic:claude-haiku-5-5`): dólares por milhão de tokens de entrada e de saída. Vem do
 * ambiente (`LLM_PRICING`), não do código: o preço do provedor muda sem release.
 */
export const ModelPriceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
});

export const PricingTableSchema = z.record(z.string().min(1), ModelPriceSchema);

export type ModelPrice = z.infer<typeof ModelPriceSchema>;
export type PricingTable = z.infer<typeof PricingTableSchema>;

export type TokenUsage = { inputTokens: number; outputTokens: number };

const PER_MILLION = 1_000_000;

/** Custo em dólares de uma chamada; `null` quando o modelo não está na tabela (não é erro). */
export function costUsd(table: PricingTable, model: string, usage: TokenUsage): number | null {
  const price = table[model];
  if (price === undefined) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / PER_MILLION;
}
