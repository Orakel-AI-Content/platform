import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Confere `Authorization: Bearer <token>` em tempo constante. Cada consumidor interno
 * (build, visualização, motor) tem o seu token, e cada rota aceita só o do seu consumidor.
 */
export function hasBearer(header: string | null, expected: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  if (match?.[1] === undefined) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(match[1]), digest(expected));
}
