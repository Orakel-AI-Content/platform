// Carga sintética de pageviews (pnpm local:load; ADR 0015 da raiz): N eventos para o Worker
// do site no edge-local, com países variados pelo X-Test-Country (alvo local).
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';

/* global __ENV -- variáveis do k6 (-e NOME=valor) */

const SITE = __ENV.SITE || 'exemplo-a';
const COUNTRIES = ['BR', 'PT', 'DE', 'US'];
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export const options = {
  scenarios: {
    pageviews: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 10),
      iterations: Number(__ENV.PAGEVIEWS || 1000),
    },
  },
  thresholds: { checks: ['rate==1'] },
};

export default function () {
  const i = exec.scenario.iterationInTest;
  const response = http.post(
    `${__ENV.TARGET}/_e/pageview`,
    JSON.stringify({
      formatVersion: 1,
      type: 'pageview',
      eventId: crypto.randomUUID(),
      page: { articleId: 1 },
    }),
    {
      headers: {
        Host: `${SITE}.localhost`,
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
        'user-agent': UA,
        'x-test-country': COUNTRIES[i % COUNTRIES.length],
      },
    },
  );
  check(response, { aceito: (r) => r.status === 200 || r.status === 204 });
}
