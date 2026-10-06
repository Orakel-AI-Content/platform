import type { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

// O que a ingestão precisa do armazenamento de objetos (12.0, L4). Implementado sobre o S3
// (SeaweedFS no local, R2 em produção) em src/lib/s3.ts e em memória nos testes.

/** Bucket privado dos originais: `uploads/` (recebidos, ainda crus) e `<site>/` (normalizados). */
export const ORIGINALS_BUCKET = 'media-originals';

export interface ObjectStore {
  /** Grava o objeto; `length` é o tamanho exato do corpo (o S3 exige com stream). */
  put(
    bucket: string,
    key: string,
    body: Readable | Uint8Array,
    length: number,
    contentType: string,
  ): Promise<void>;
  /** Lê o objeto inteiro; `undefined` se não existir. */
  get(bucket: string, key: string): Promise<Uint8Array | undefined>;
  delete(bucket: string, key: string): Promise<void>;
}

/** Armazenamento em memória, para os testes. */
export function memoryStore(): ObjectStore & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(bucket, key, body, length) {
      const data = body instanceof Uint8Array ? body : await buffer(body);
      if (data.byteLength !== length) {
        throw new Error(`Corpo com ${data.byteLength} bytes; o anunciado era ${length}`);
      }
      objects.set(`${bucket}/${key}`, new Uint8Array(data));
    },
    get(bucket, key) {
      return Promise.resolve(objects.get(`${bucket}/${key}`));
    },
    delete(bucket, key) {
      objects.delete(`${bucket}/${key}`);
      return Promise.resolve();
    },
  };
}
