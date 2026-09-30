import type { Result } from '@orakel/content-model';
import { eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { userRoles, users, type Role } from '../../db/schema/index.ts';
import type { Actor } from './rbac.ts';

/** Pessoa cadastrada pelo e-mail do JWT; sem cadastro ou sem papel, sem acesso. */
export async function resolveActor(db: Executor, email: string): Promise<Result<Actor>> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(users.email, email.toLowerCase()));
  if (rows.length === 0) {
    return {
      ok: false,
      issues: [{ code: 'forbidden', message: 'Usuário sem acesso ao Backoffice', path: [] }],
    };
  }
  return { ok: true, value: { email: email.toLowerCase(), roles: rows.map((row) => row.role) } };
}

/** Cria ou atualiza uma pessoa e os papéis dela (seed e, depois, a tela de usuários). */
export async function upsertUser(
  db: Executor,
  input: { email: string; name: string; roles: readonly Role[] },
) {
  const email = input.email.toLowerCase();
  const [user] = await db
    .insert(users)
    .values({ email, name: input.name })
    .onConflictDoUpdate({ target: users.email, set: { name: input.name } })
    .returning({ id: users.id });
  if (user === undefined) throw new Error(`Falha ao gravar o usuário ${email}`);
  await db.delete(userRoles).where(eq(userRoles.userId, user.id));
  if (input.roles.length > 0) {
    await db.insert(userRoles).values(input.roles.map((role) => ({ userId: user.id, role })));
  }
  return user.id;
}
