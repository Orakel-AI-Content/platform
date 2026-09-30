import type { Result } from '@orakel/content-model';
import { headers } from 'next/headers';
import { cache } from 'react';

import { getDb } from '../db/client.ts';
import type { Actor } from '../domain/access/rbac.ts';
import { resolveActor } from '../domain/access/users.ts';
import { getEnv } from '../env.ts';
import { accessConfigFromEnv, verifyAccessToken, type AccessConfig } from './access-jwt.ts';

let config: AccessConfig | undefined;

/** Quem faz a requisição atual (UI e route handlers): JWT do Access → usuário e papéis. */
export const currentActor = cache(async (): Promise<Result<Actor>> => {
  config ??= accessConfigFromEnv(getEnv());
  const token = (await headers()).get('cf-access-jwt-assertion');
  const verified = await verifyAccessToken(token, config);
  if (!verified.ok) return verified;
  return resolveActor(getDb().db, verified.value.email);
});
