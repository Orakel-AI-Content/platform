import type { Issue } from '@orakel/content-model';

import type { ContentFormResult } from '@/components/contents/contentEditorValues.ts';

// Tradução comum das Server Actions que gravam pelo editor de conteúdo: a edição (`conteudos`)
// e a correção na revisão (`revisao`). Fora dos arquivos `'use server'`, que só exportam
// funções assíncronas.

/** Issues do domínio no formato serializável do editor (o `path` aponta o campo). */
export function refused(issues: readonly Issue[]): ContentFormResult {
  return {
    ok: false,
    message: 'Não foi possível salvar o conteúdo.',
    issues: issues.map((issue) => ({
      path: issue.path.map((key) => (typeof key === 'number' ? key : String(key))),
      message: issue.message,
    })),
  };
}

export const noSession: ContentFormResult = {
  ok: false,
  message: 'Sessão inválida; entre de novo.',
  issues: [],
};
