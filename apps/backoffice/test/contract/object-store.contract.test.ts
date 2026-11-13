import { randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ObjectStore } from '../../src/domain/media/store.ts';
import { createS3Client, DELETE_BATCH, s3ObjectStore } from '../../src/lib/s3.ts';

// Listagem e remoção em lote do ObjectStore contra um S3 de verdade (SeaweedFS: o do
// `local:up` ou o do job de contrato no CI), num bucket criado e apagado pelo próprio teste.

let client: S3Client;
let store: ObjectStore;
const bucket = `contrato-${randomUUID()}`;
const COUNT = DELETE_BATCH + 1;

function s3Env() {
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error('Defina S3_ENDPOINT, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY (SeaweedFS)');
  }
  return { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY };
}

beforeAll(async () => {
  client = createS3Client(s3Env());
  store = s3ObjectStore(client);
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  const keys = Array.from({ length: COUNT }, (_, i) => `img/${String(i).padStart(4, '0')}.webp`);
  for (let i = 0; i < keys.length; i += 50) {
    await Promise.all(
      keys
        .slice(i, i + 50)
        .map((key) => store.put(bucket, key, new Uint8Array([1]), 1, 'image/webp')),
    );
  }
  await store.put(bucket, 'outro/x.webp', new Uint8Array([1]), 1, 'image/webp');
}, 120_000);

afterAll(async () => {
  await store.deleteMany(bucket, await store.list(bucket));
  await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  client.destroy();
});

describe('ObjectStore no S3', () => {
  it('lista além de uma página de 1000 chaves, com e sem prefixo', async () => {
    const all = await store.list(bucket);

    expect(all).toHaveLength(COUNT + 1);
    expect(new Set(all).size).toBe(COUNT + 1);
    expect(await store.list(bucket, 'outro/')).toEqual(['outro/x.webp']);
  });

  it('bucket inexistente lista vazio', async () => {
    expect(await store.list(`contrato-inexistente-${randomUUID()}`)).toEqual([]);
  });

  it('remove em lotes de no máximo 1000 chaves e deixa o bucket vazio', async () => {
    const send = vi.spyOn(client, 'send');
    const keys = await store.list(bucket);

    await store.deleteMany(bucket, keys);

    const batches = send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof DeleteObjectsCommand)
      .map((command) => command.input.Delete?.Objects?.length);
    send.mockRestore();
    expect(batches).toEqual([DELETE_BATCH, keys.length - DELETE_BATCH]);
    expect(await store.list(bucket)).toEqual([]);
  });

  it('remover chaves que não existem não é erro', async () => {
    await expect(store.deleteMany(bucket, ['nao-existe.webp'])).resolves.toBeUndefined();
  });
});
