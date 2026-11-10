import * as z from 'zod';

// Formato da release do core, sem banco: o formulário de cadastro (cliente) e o domínio
// (`releases.ts`) validam pelo mesmo schema. O valor é a tag da imagem site-builder que o
// release.yml publica: a tag Git core-vX.Y.Z vira a imagem site-builder:X.Y.Z.

export const RELEASE_TAG_MESSAGE =
  'Informe a versão no formato X.Y.Z (ex.: 1.2.0), a da imagem publicada pela tag Git core-vX.Y.Z.';

/** Release do core: X.Y.Z, a tag da imagem site-builder (sem o prefixo core-v da tag Git). */
export const ReleaseTagSchema = z
  .string({ error: RELEASE_TAG_MESSAGE })
  .trim()
  .regex(/^\d+\.\d+\.\d+$/, RELEASE_TAG_MESSAGE);

/** Formulário de cadastro: o `SchemaForm` desenha e valida, o domínio valida de novo. */
export const RegisterReleaseSchema = z.object({ tag: ReleaseTagSchema });
export type RegisterReleaseValue = z.infer<typeof RegisterReleaseSchema>;
