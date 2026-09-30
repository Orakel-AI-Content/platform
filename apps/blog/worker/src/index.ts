import { EVENT_MANIFEST_PATH, PAGEVIEW_ENDPOINT } from '@orakel/events/v1';

import { resolveCountry } from './country.ts';
import { createManifestCache, type ManifestIndex } from './manifest-cache.ts';
import { handlePageview, type Outcome } from './pageview.ts';

// Borda do Worker: lê env e request, chama o fluxo e traduz o resultado em Response.
// Só `/_e/*` chega aqui (`run_worker_first`); o resto do site é estático. Falha na
// medição perde o evento, nunca a página.

let manifest: (() => Promise<ManifestIndex>) | undefined;

function respond(outcome: Outcome): Response {
  const headers = { 'cache-control': 'no-store' };
  return outcome.body === undefined
    ? new Response(null, { status: outcome.status, headers })
    : Response.json(outcome.body, { status: outcome.status, headers });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== PAGEVIEW_ENDPOINT) return respond({ status: 404 });
    if (request.method !== 'POST') {
      return new Response(null, {
        status: 405,
        headers: { allow: 'POST', 'cache-control': 'no-store' },
      });
    }

    manifest ??= createManifestCache(async () => {
      const response = await env.ASSETS.fetch(new URL(EVENT_MANIFEST_PATH, url));
      if (!response.ok) throw new Error(`Manifesto de eventos respondeu ${response.status}`);
      return response.json();
    });

    const contentLength = request.headers.get('content-length');
    try {
      const outcome = await handlePageview(
        {
          userAgent: request.headers.get('user-agent'),
          mobileHint: request.headers.get('sec-ch-ua-mobile'),
          secFetchSite: request.headers.get('sec-fetch-site'),
          origin: request.headers.get('origin'),
          requestOrigin: url.origin,
          contentLength: contentLength === null ? null : Number(contentLength),
          country: resolveCountry(
            request.cf?.country,
            request.headers.get('x-test-country'),
            env.ALLOW_COUNTRY_OVERRIDE === 'true',
          ),
          readBody: () => request.text(),
        },
        {
          site: env.SITE_ID,
          getManifest: manifest,
          // waitUntil: no Analytics Engine o writeDataPoint é síncrono, mas no ae-sim local é um
          // service binding (RPC), que seria descartado quando a resposta termina.
          write: (point) => ctx.waitUntil(Promise.resolve(env.EVENTS.writeDataPoint(point))),
          uuid: () => crypto.randomUUID(),
        },
      );
      return respond(outcome);
    } catch (error) {
      console.error(JSON.stringify({ msg: 'Falha ao registrar pageview', error: String(error) }));
      return respond({ status: 204 });
    }
  },
} satisfies ExportedHandler<Env>;

/** Só para testes: esquece o manifesto em memória, como um isolate novo. */
export function resetManifestCache(): void {
  manifest = undefined;
}
