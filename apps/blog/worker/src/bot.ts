import { isbot } from 'isbot';

/**
 * Bots saem da medição, nunca do acesso: a página é estática e nunca passa por aqui.
 * Sem user-agent também conta como bot (navegadores reais sempre enviam).
 */
export function isBot(userAgent: string | null): boolean {
  return userAgent === null || userAgent.trim() === '' || isbot(userAgent);
}
