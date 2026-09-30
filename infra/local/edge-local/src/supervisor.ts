// Supervisor (ADR 0002 e 0003 da unidade): uma instância ativa por site; publicar e voltar
// trocam sem queda (sobe a nova, aponta o proxy, desliga a antiga); um publish por vez por
// site; no reinício, sobe as versões ativas.
import type { Instance, Runtime } from './runtime.ts';
import { StoreError, type Store } from './store.ts';

export type Log = (message: Record<string, unknown>) => void;

type Active = { id: string; instance: Instance };

export class Supervisor {
  readonly store: Store;
  readonly #runtime: Runtime;
  readonly #keep: number;
  readonly #log: Log;
  readonly #active = new Map<string, Active>();
  readonly #busy = new Set<string>();
  #aeSim: Instance | undefined;

  constructor(options: { store: Store; runtime: Runtime; keep: number; log: Log }) {
    this.store = options.store;
    this.#runtime = options.runtime;
    this.#keep = options.keep;
    this.#log = options.log;
  }

  async startAeSim(configPath: string): Promise<void> {
    this.#aeSim = await this.#runtime.start(configPath);
    this.#log({ msg: 'ae-sim no ar' });
  }

  /** Sobe a versão ativa de cada site (reinício do container). */
  async restore(): Promise<void> {
    for (const site of await this.store.sites()) {
      const id = await this.store.active(site);
      if (!id) continue;
      try {
        await this.#switch(site, id);
      } catch (error) {
        this.#log({ msg: 'versão ativa não subiu', site, id, error: String(error) });
      }
    }
  }

  /** Instância que atende o site agora. */
  target(site: string): URL | undefined {
    return this.#active.get(site)?.instance.url;
  }

  activeId(site: string): string | undefined {
    return this.#active.get(site)?.id;
  }

  async publish(site: string, archive: Uint8Array): Promise<string> {
    return this.#exclusive(site, async () => {
      const id = await this.store.add(site, archive);
      try {
        await this.#switch(site, id);
      } catch (error) {
        await this.store.remove(site, id);
        throw new StoreError(`A versão não subiu: ${String(error)}`, 400);
      }
      const pruned = await this.store.prune(site, this.#keep);
      this.#log({ msg: 'versão publicada', site, id, pruned });
      return id;
    });
  }

  async rollback(site: string, id?: string): Promise<string> {
    return this.#exclusive(site, async () => {
      const target = await this.store.rollbackTarget(site, id);
      await this.#switch(site, target);
      this.#log({ msg: 'rollback', site, id: target });
      return target;
    });
  }

  async stop(): Promise<void> {
    const instances = [...this.#active.values()].map((active) => active.instance);
    if (this.#aeSim) instances.push(this.#aeSim);
    await Promise.allSettled(instances.map((instance) => instance.dispose()));
    this.#active.clear();
  }

  async #switch(site: string, id: string): Promise<void> {
    const next = await this.#runtime.start(this.store.configPath(site, id));
    const previous = this.#active.get(site);
    this.#active.set(site, { id, instance: next });
    await this.store.setActive(site, id);
    if (previous) await previous.instance.dispose().catch(() => undefined);
  }

  async #exclusive<T>(site: string, work: () => Promise<T>): Promise<T> {
    if (this.#busy.has(site)) throw new StoreError(`Outra operação em andamento para ${site}`, 409);
    this.#busy.add(site);
    try {
      return await work();
    } finally {
      this.#busy.delete(site);
    }
  }
}
