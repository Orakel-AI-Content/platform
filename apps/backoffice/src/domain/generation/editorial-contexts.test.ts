import { describe, expect, it } from 'vitest';

import type { Executor } from '../../db/client.ts';
import type { Actor } from '../access/rbac.ts';
import { createEditorialContext, listEditorialContexts } from './editorial-contexts.ts';

// A permissão é conferida antes de qualquer consulta: o executor recusa ser usado.
const untouchable = new Proxy({} as Executor, {
  get() {
    throw new Error('o domínio não deveria consultar o banco sem permissão');
  },
});

const revisor: Actor = { email: 'revisor@exemplo.com', roles: ['revisor'] };
const nobody: Actor = { email: 'ninguem@exemplo.com', roles: [] };

describe('contextos editoriais', () => {
  it('recusa criar versão sem content.write', async () => {
    await expect(createEditorialContext(untouchable, revisor, 'exemplo-a', 'Tom')).resolves.toEqual(
      {
        ok: false,
        issues: [{ code: 'forbidden', message: 'Sem permissão para content.write', path: [] }],
      },
    );
  });

  it('recusa listar sem site.read', async () => {
    await expect(listEditorialContexts(untouchable, nobody, 'exemplo-a')).resolves.toEqual({
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão para site.read', path: [] }],
    });
  });

  it('recusa texto vazio antes de consultar o banco', async () => {
    const editor: Actor = { email: 'editor@exemplo.com', roles: ['editor'] };
    await expect(
      createEditorialContext(untouchable, editor, 'exemplo-a', '  \n '),
    ).resolves.toEqual({
      ok: false,
      issues: [
        {
          code: 'editorial_context.empty',
          message: 'Escreva o contexto editorial',
          path: ['body'],
        },
      ],
    });
  });
});
