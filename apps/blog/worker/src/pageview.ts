import {
  canIssueSession,
  discardDataPoint,
  MAX_BODY_BYTES,
  pageviewDataPoint,
  parseEventBody,
  type DataPoint,
  type DiscardReason,
  type PageviewResponse,
} from '@orakel/events/v1';

import { isBot } from './bot.ts';
import { deviceClass } from './device.ts';
import type { ManifestIndex } from './manifest-cache.ts';
import { isSameOrigin } from './origin.ts';

// Fluxo do pageview, sem Request nem env: tudo chega extraído ou injetado (ADR 0002).
// Ordem: bot → origem → corpo → manifesto → sessão → ponto no Analytics Engine.

/** Dados da requisição que o fluxo usa, extraídos pelo handler. */
export type PageviewRequest = {
  userAgent: string | null;
  mobileHint: string | null;
  secFetchSite: string | null;
  origin: string | null;
  requestOrigin: string;
  contentLength: number | null;
  country: string | undefined;
  readBody: () => Promise<string>;
};

export type PageviewDeps = {
  /** `SITE_ID` do Worker, nunca do payload. */
  site: string;
  getManifest: () => Promise<ManifestIndex>;
  write: (point: DataPoint) => void;
  uuid: () => string;
};

export type Outcome = { status: number; body?: PageviewResponse };

const STATUS: Record<DiscardReason, number> = {
  bot: 204, // não sinaliza nada ao bot
  origin: 403,
  size: 413,
  schema: 400,
  manifest: 422,
};

export async function handlePageview(req: PageviewRequest, deps: PageviewDeps): Promise<Outcome> {
  const discard = (reason: DiscardReason): Outcome => {
    deps.write(discardDataPoint({ site: deps.site, reason, country: req.country }));
    return { status: STATUS[reason] };
  };

  if (isBot(req.userAgent)) return discard('bot');
  if (!isSameOrigin(req, req.requestOrigin)) return discard('origin');
  if (req.contentLength !== null && req.contentLength > MAX_BODY_BYTES) return discard('size');

  const parsed = parseEventBody(await req.readBody());
  if (!parsed.ok)
    return discard(parsed.issues.some((issue) => issue.code === 'size') ? 'size' : 'schema');
  const event = parsed.value;

  let articleId: number | undefined;
  let path: string;
  if ('articleId' in event.page) {
    articleId = event.page.articleId;
    const articlePath = (await deps.getManifest()).get(articleId);
    if (articlePath === undefined) return discard('manifest');
    path = articlePath;
  } else {
    path = event.page.path;
  }

  const sid = canIssueSession(req.country) ? (event.sid ?? deps.uuid()) : undefined;

  deps.write(
    pageviewDataPoint({
      site: deps.site,
      path,
      articleId,
      country: req.country,
      device: deviceClass(req.userAgent ?? '', req.mobileHint),
      referrer: event.referrer,
      sid,
    }),
  );
  return { status: 200, body: sid === undefined ? {} : { sid } };
}
