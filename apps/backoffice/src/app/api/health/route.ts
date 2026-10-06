import { sql } from 'drizzle-orm';

import { getDb } from '@/db/client.ts';

export const dynamic = 'force-dynamic';

/** Saúde do processo web (healthcheck do compose e heartbeat da VPS): responde e alcança o Postgres. */
export async function GET(): Promise<Response> {
  try {
    await getDb().db.execute(sql`select 1`);
    return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json(
      { status: 'degraded' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
