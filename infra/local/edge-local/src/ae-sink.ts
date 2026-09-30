// Destino dos pontos do ae-sim (ADR 0006 da unidade; ADR 0014 da raiz): ClickHouse, na tabela
// events com o layout do Analytics Engine, ou NDJSON quando não há ClickHouse (testes).
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Argumento do writeDataPoint do binding do Analytics Engine. */
export type DataPoint = {
  indexes?: string[];
  blobs?: (string | null)[];
  doubles?: number[];
};

export type Sink = (point: DataPoint, receivedAt: Date) => Promise<void>;

export const MAX_BLOBS = 20;
export const MAX_DOUBLES = 20;

/** Ponto → linha da tabela events: index1, blob1…blobN, double1…doubleN, timestamp. */
export function toRow(point: DataPoint, receivedAt: Date): Record<string, string | number> {
  const row: Record<string, string | number> = {
    timestamp: receivedAt.toISOString(),
    index1: point.indexes?.[0] ?? '',
  };
  (point.blobs ?? []).slice(0, MAX_BLOBS).forEach((blob, i) => {
    row[`blob${i + 1}`] = blob ?? '';
  });
  (point.doubles ?? []).slice(0, MAX_DOUBLES).forEach((value, i) => {
    row[`double${i + 1}`] = value;
  });
  return row;
}

export function ndjsonSink(dataDir: string): Sink {
  return async (point, receivedAt) => {
    const dir = join(dataDir, 'events');
    await mkdir(dir, { recursive: true });
    await appendFile(
      join(dir, `${receivedAt.toISOString().slice(0, 10)}.ndjson`),
      `${JSON.stringify({ receivedAt: receivedAt.toISOString(), ...point })}\n`,
    );
  };
}

export type ClickHouseConfig = {
  url: string;
  user: string;
  password: string;
  database: string;
};

/** Consulta pela interface HTTP do ClickHouse (a mesma que o agregador usará localmente). */
export async function clickhouse(config: ClickHouseConfig, query: string, body?: string) {
  const url = new URL(config.url);
  url.searchParams.set('database', config.database);
  url.searchParams.set('query', query);
  url.searchParams.set('date_time_input_format', 'best_effort');
  url.searchParams.set('output_format_json_quote_64bit_integers', '0');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-ClickHouse-User': config.user, 'X-ClickHouse-Key': config.password },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ClickHouse ${response.status}: ${text.slice(0, 500)}`);
  return text;
}

export function clickhouseSink(config: ClickHouseConfig): Sink {
  return async (point, receivedAt) => {
    await clickhouse(
      config,
      'INSERT INTO events FORMAT JSONEachRow',
      JSON.stringify(toRow(point, receivedAt)),
    );
  };
}
