import * as z from 'zod';

import { fail, issuesFromZod, ok, type Result } from '../result.ts';
import { FORMAT_VERSION } from './version.ts';

// Payload que o navegador envia a `/_e/*`. O navegador informa o mínimo: site, horário,
// país e IP nunca vêm daqui — o Worker deriva o que precisa (privacidade e anti-fraude).

/** Tamanho máximo do corpo, conferido antes do parse (proposta). */
export const MAX_BODY_BYTES = 2048;

/** Caminho do próprio site: começa com uma única barra, sem espaços. */
export const PathSchema = z
  .string()
  .max(512)
  .regex(/^\/(?!\/)\S*$/, 'Use um caminho iniciado por /');

/** Página vista: um artigo (o Worker confere no manifesto) ou outra página pelo tipo e caminho. */
export const PageRefSchema = z.union([
  z.object({ articleId: z.number().int().positive() }),
  z.object({ pageType: z.string().regex(/^[a-z][a-z0-9-]*$/), path: PathSchema }),
]);

export type PageRef = z.infer<typeof PageRefSchema>;

export const PageviewPayloadSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  type: z.literal('pageview'),
  eventId: z.uuid(),
  page: PageRefSchema,
  /** URL de origem da visita; o layout grava só o host. */
  referrer: z.string().max(1024).optional(),
  sid: z.uuid().optional(),
});

export type PageviewPayload = z.infer<typeof PageviewPayloadSchema>;

/** Eventos da v1, discriminados por `type`. Impressões e cliques de afiliado entram na fase 3. */
export const EventPayloadSchema = z.discriminatedUnion('type', [PageviewPayloadSchema]);

export type EventPayload = z.infer<typeof EventPayloadSchema>;

/** Resposta do Worker ao pageview: o `sid` só quando ele pode emitir sessão. */
export type PageviewResponse = { sid?: string };

/**
 * Tamanho, JSON e schema do corpo recebido pelo Worker, nessa ordem. Os códigos dos
 * problemas (`size`, `json`, `schema.*`) dizem ao Worker o motivo do descarte.
 */
export function parseEventBody(body: string): Result<EventPayload> {
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return fail([{ code: 'size', message: `Corpo acima de ${MAX_BODY_BYTES} bytes`, path: [] }]);
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail([{ code: 'json', message: 'Corpo não é JSON', path: [] }]);
  }
  const parsed = EventPayloadSchema.safeParse(json);
  return parsed.success ? ok(parsed.data) : fail(issuesFromZod(parsed.error));
}
