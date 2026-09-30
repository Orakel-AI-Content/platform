import { S3Client } from '@aws-sdk/client-s3';

import type { Env } from '../env.ts';

// Cliente S3 único para SeaweedFS (local) e R2 (produção): só o protocolo muda de endpoint.
// A ingestão de imagens (originais e variantes) é backlog do módulo Mídia.
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
