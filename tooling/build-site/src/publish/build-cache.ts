// Saída compactada no bucket build-cache (R2 em produção, S3 local), para reconstruir ou
// auditar uma versão publicada.
import { readFile } from 'node:fs/promises';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { ClassifiedError } from '../failures.ts';

export type CacheConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function cacheKey(site: string, versionId: string): string {
  return `${site}/${versionId}.tar.gz`;
}

export async function uploadBuildCache(config: CacheConfig, key: string, archive: string) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: await readFile(archive),
        ContentType: 'application/gzip',
      }),
    );
  } catch (error) {
    throw new ClassifiedError(`build-cache: ${(error as Error).message}`, 'transient');
  } finally {
    client.destroy();
  }
}
