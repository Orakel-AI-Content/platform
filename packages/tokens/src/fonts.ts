// Fontes do tema: nome com hash do conteúdo, para o blog servir `/fonts/*` como immutable.
import { createHash } from 'node:crypto';

/** Caminho público das fontes no site; o blog copia `dist/fonts/` para cá. */
export const FONTS_URL = '/fonts/';

/** `inter.woff2` + conteúdo → `inter.3f2a1b4c.woff2`. */
export function hashedFontName(file: string, content: Uint8Array): string {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
  return file.replace(/\.woff2$/, `.${hash}.woff2`);
}
