import { describe, expect, it } from 'vitest';

import { savedFormValues } from './content-editor-values.ts';

// Reiniciar o editor com a versão salva (#110): os vazios do envio ficam, o resto vem do
// servidor.

describe('savedFormValues', () => {
  it('devolve os campos vazios que a versão salva não traz, inclusive aninhados', () => {
    const sent = {
      title: 'Guia',
      description: '',
      seo: { title: '', description: 'SEO', canonical: '' },
      authorIds: [],
    };
    const saved = { title: 'Guia', seo: { description: 'SEO' } };

    expect(savedFormValues(saved, sent)).toEqual({
      title: 'Guia',
      description: '',
      seo: { title: '', description: 'SEO', canonical: '' },
      authorIds: [],
    });
  });

  it('campo sem valor (a capa sem mídia) mantém a chave', () => {
    const result = savedFormValues({ title: 'Guia' }, { title: 'Guia', coverMediaId: undefined });

    expect(Object.keys(result as object)).toEqual(['title', 'coverMediaId']);
  });

  it('o SEO todo em branco, que a versão salva não traz, volta inteiro', () => {
    const sent = { title: 'Guia', seo: { title: '', description: '', canonical: '' } };

    expect(savedFormValues({ title: 'Guia' }, sent)).toEqual(sent);
  });

  it('o bloco novo fica com o n do servidor e sem o new', () => {
    const sent = {
      blocks: [
        { n: 1, type: 'quote', content: [], attribution: '' },
        { new: true, type: 'toc', title: 'Novo' },
      ],
    };
    const saved = {
      blocks: [
        { n: 1, type: 'quote', content: [] },
        { n: 4, type: 'toc', title: 'Novo' },
      ],
    };

    expect(savedFormValues(saved, sent)).toEqual({
      blocks: [
        { n: 1, type: 'quote', content: [], attribution: '' },
        { n: 4, type: 'toc', title: 'Novo' },
      ],
    });
  });

  it('valor preenchido no envio e ausente na versão salva não volta', () => {
    expect(savedFormValues({ title: 'A' }, { title: 'A', description: 'texto' })).toEqual({
      title: 'A',
    });
  });

  it('listas de tamanhos diferentes ficam como a versão salva', () => {
    expect(savedFormValues({ blocks: [{ n: 1 }] }, { blocks: [{ n: 1 }, { n: 2 }] })).toEqual({
      blocks: [{ n: 1 }],
    });
  });
});
