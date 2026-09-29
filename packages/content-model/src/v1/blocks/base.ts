import * as z from 'zod';

/**
 * Número estável do bloco no artigo: atribuído pelo Backoffice na criação e nunca
 * reutilizado, mesmo depois de reordenar ou remover blocos. A posição é outro dado.
 */
export const BlockNumberSchema = z.number().int().positive();

export const blockBase = { n: BlockNumberSchema };
