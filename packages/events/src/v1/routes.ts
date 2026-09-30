// Caminhos combinados entre o site, o build e o Worker. Sem Zod: o script do navegador
// importa daqui.

/** Único prefixo em que o Worker executa código (`run_worker_first`). */
export const EVENT_ROUTE_PREFIX = '/_e/';

/** Onde o script envia o pageview. */
export const PAGEVIEW_ENDPOINT = '/_e/pageview';

/** Manifesto de eventos nos assets do site, fora de `/_e/*` para não disparar o Worker (proposta). */
export const EVENT_MANIFEST_PATH = '/_data/events-manifest.json';
