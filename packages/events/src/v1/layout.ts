import { FORMAT_VERSION } from './version.ts';

// Layout posicional do Workers Analytics Engine, v1 (proposta). Único lugar que sabe que
// `blob5` é país: o Worker grava com `pageviewDataPoint` e `discardDataPoint`, o agregador
// monta o SQL com `COLUMNS`. Mudança compatível acrescenta posição no fim de BLOB_FIELDS;
// nunca reordene nem reaproveite uma posição (ADR 0002 e 0005).

export const EVENT_TYPES = ['pageview', 'discard'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const DEVICE_CLASSES = ['mobile', 'tablet', 'desktop'] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/** Motivos de descarte gravados em `blob9` (ADR 0005). */
export const DISCARD_REASONS = ['bot', 'origin', 'size', 'schema', 'manifest'] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

/** Ordem dos blobs: o índice + 1 é a posição (`formatVersion` → `blob1`). */
export const BLOB_FIELDS = [
  'formatVersion',
  'type',
  'path',
  'articleId',
  'country',
  'device',
  'referrerHost',
  'sid',
  'discardReason',
] as const;

export type BlobField = (typeof BLOB_FIELDS)[number];

/** Nome da coluna no SQL do Analytics Engine para cada campo. */
export const COLUMNS = {
  site: 'index1',
  count: 'double1',
  ...(Object.fromEntries(BLOB_FIELDS.map((field, i) => [field, `blob${i + 1}`])) as Record<
    BlobField,
    `blob${number}`
  >),
} as const;

/** Argumento de `writeDataPoint` do binding do Analytics Engine. */
export type DataPoint = {
  indexes: [string];
  blobs: string[];
  doubles: number[];
};

function dataPoint(site: string, fields: Partial<Record<BlobField, string>>): DataPoint {
  return {
    indexes: [site],
    blobs: BLOB_FIELDS.map((field) => fields[field] ?? ''),
    doubles: [1],
  };
}

/** Só o host da origem, nunca a URL inteira. Referrer inválido ou ausente vira vazio. */
export function referrerHost(referrer: string | undefined): string {
  if (referrer === undefined || referrer === '') return '';
  try {
    return new URL(referrer).hostname;
  } catch {
    return '';
  }
}

export type PageviewPoint = {
  /** `SITE_ID` do Worker, nunca do payload. */
  site: string;
  path: string;
  articleId?: number;
  country?: string;
  device: DeviceClass;
  referrer?: string;
  sid?: string;
};

export function pageviewDataPoint(point: PageviewPoint): DataPoint {
  return dataPoint(point.site, {
    formatVersion: String(FORMAT_VERSION),
    type: 'pageview',
    path: point.path,
    articleId: point.articleId === undefined ? '' : String(point.articleId),
    country: point.country ?? '',
    device: point.device,
    referrerHost: referrerHost(point.referrer),
    sid: point.sid ?? '',
  });
}

/** Descarte: só site, país e motivo — sem caminho, referrer nem `sid`. */
export function discardDataPoint(point: {
  site: string;
  reason: DiscardReason;
  country?: string;
}): DataPoint {
  return dataPoint(point.site, {
    formatVersion: String(FORMAT_VERSION),
    type: 'discard',
    country: point.country ?? '',
    discardReason: point.reason,
  });
}
