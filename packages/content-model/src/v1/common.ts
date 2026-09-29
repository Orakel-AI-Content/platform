import * as z from 'zod';

/** ID numérico estável do Backoffice. Nunca o slug: o slug muda, o ID não. */
export const IdSchema = z.number().int().positive();

/** `kebab-case` ASCII: `meu-artigo-2`. */
export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use kebab-case: letras minúsculas, números e hífens');

/** Nome de host sem esquema nem porta: `exemplo.com.br`. */
export const HostnameSchema = z
  .string()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Use um nome de host em minúsculas, sem esquema nem porta',
  );

/** Caminho do próprio site (`/categoria/x/`) ou URL absoluta http(s). */
export const HrefSchema = z
  .string()
  .refine(isHref, 'Use um caminho iniciado por / ou uma URL http(s)');

/** Caminho do próprio site, iniciado por uma única barra. */
export const PathSchema = z.string().regex(/^\/(?!\/)\S*$/, 'Use um caminho iniciado por /');

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

/** Tag de idioma BCP 47 simples: `pt-BR`, `en`. */
export const LanguageSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, 'Use uma tag de idioma como pt-BR');

/** Fuso IANA (`America/Sao_Paulo`), conferido pelo `Intl` do runtime. */
export const TimeZoneSchema = z
  .string()
  .refine(isTimeZone, 'Use um fuso IANA, como America/Sao_Paulo');

function isHref(value: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
