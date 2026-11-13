import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  NoSuchBucket,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { ObjectStore } from '../domain/media/store.ts';
import type { Env } from '../env.ts';

/** Máximo de chaves por `DeleteObjects` (S3 e R2). */
export const DELETE_BATCH = 1000;

// Cliente S3 único para SeaweedFS (local) e R2 (produção): só o protocolo muda de endpoint.
export function createS3Client(
  env: Pick<Env, 'S3_ENDPOINT' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY'>,
) {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
}

/** Armazenamento de objetos da ingestão de mídia sobre o S3. */
export function s3ObjectStore(client: S3Client): ObjectStore {
  return {
    async put(bucket, key, body, length, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentLength: length,
          ContentType: contentType,
        }),
      );
    },
    async get(bucket, key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return object.Body ? await object.Body.transformToByteArray() : undefined;
      } catch (error) {
        if (error instanceof NoSuchKey) return undefined;
        throw error;
      }
    },
    async delete(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async exists(bucket, key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (error) {
        if (error instanceof NotFound) return false;
        throw error;
      }
    },
    async list(bucket, prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      try {
        do {
          const page = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
          );
          for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
          token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
      } catch (error) {
        if (error instanceof NoSuchBucket) return [];
        throw error;
      }
      return keys;
    },
    async deleteMany(bucket, keys) {
      for (let i = 0; i < keys.length; i += DELETE_BATCH) {
        const batch = keys.slice(i, i + DELETE_BATCH);
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        const failed = result.Errors ?? [];
        if (failed.length > 0) {
          const first = failed[0];
          throw new Error(
            `${failed.length} objetos de ${bucket} não foram removidos ` +
              `(${first?.Key}: ${first?.Code} ${first?.Message})`,
          );
        }
      }
    },
  };
}
