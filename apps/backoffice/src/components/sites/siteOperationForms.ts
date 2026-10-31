import * as z from 'zod';

// Schemas dos formulários de operação da página do site (#333): o `SchemaForm` desenha e
// valida por eles, e a Server Action valida de novo antes de delegar ao domínio. Sem
// `'use client'`, para a Server Action importá-los (um arquivo `'use server'` só exporta
// funções assíncronas).

const WINDOW_MESSAGE = 'Informe um número inteiro de segundos, 0 ou mais.';
const LIMIT_MESSAGE = 'Informe um número inteiro de publicações, 1 ou mais.';

/** Registro do G1, com observação opcional. */
export const RegisterG1Schema = z.object({ note: z.string().trim().optional() });
export type RegisterG1Value = z.infer<typeof RegisterG1Schema>;

/** Janela própria de agrupamento, em segundos; "Usar padrão" não passa por aqui. */
export const BuildWindowSchema = z.object({
  buildWindowSeconds: z
    .number({ error: WINDOW_MESSAGE })
    .int(WINDOW_MESSAGE)
    .min(0, WINDOW_MESSAGE),
});
export type BuildWindowValue = z.infer<typeof BuildWindowSchema>;

/** Limite diário próprio de publicações (#490); "Usar padrão" não passa por aqui. */
export const DailyPublishLimitSchema = z.object({
  dailyPublishLimit: z.number({ error: LIMIT_MESSAGE }).int(LIMIT_MESSAGE).min(1, LIMIT_MESSAGE),
});
export type DailyPublishLimitValue = z.infer<typeof DailyPublishLimitSchema>;
