// ae-sim: substituto local do Analytics Engine (binding EVENTS dos sites, por service
// binding). writeDataPoint repassa o ponto, com o layout posicional, ao supervisor, que o
// grava em NDJSON. Um Worker não grava arquivo; por isso o repasse.
import { WorkerEntrypoint } from 'cloudflare:workers';

export default class AeSim extends WorkerEntrypoint {
  /** @param {{ indexes?: string[], blobs?: (string | null)[], doubles?: number[] }} point */
  writeDataPoint(point) {
    this.ctx.waitUntil(
      fetch(this.env.SINK, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(point),
      }),
    );
  }

  fetch() {
    return new Response('ae-sim: use o binding EVENTS (writeDataPoint)\n');
  }
}
