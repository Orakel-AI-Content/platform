import * as z from 'zod';

// Formato da tag de release do core (docs/conventions/git.md), sem banco: o formulário de
// cadastro (cliente) e o domínio (`releases.ts`) validam pelo mesmo schema.

export const RELEASE_TAG_MESSAGE = 'Informe a tag no formato core-vX.Y.Z (ex.: core-v1.2.0).';

/** Tag de release do core: core-vX.Y.Z. */
export const ReleaseTagSchema = z
  .string({ error: RELEASE_TAG_MESSAGE })
  .trim()
  .regex(/^core-v\d+\.\d+\.\d+$/, RELEASE_TAG_MESSAGE);

/** Formulário de cadastro: o `SchemaForm` desenha e valida, o domínio valida de novo. */
export const RegisterReleaseSchema = z.object({ tag: ReleaseTagSchema });
export type RegisterReleaseValue = z.infer<typeof RegisterReleaseSchema>;
