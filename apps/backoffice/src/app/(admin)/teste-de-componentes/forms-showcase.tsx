'use client';

import { IsoDateTimeSchema, RichTextSchema } from '@orakel/content-model/v1';
import { z } from 'zod';

import { richTextField } from '@/components/forms/RichTextField';
import { SchemaForm } from '@/components/forms/SchemaForm';
import { zonedDateTimeField } from '@/components/forms/ZonedDatetimeField';
import { SiteSwitcher, type SwitcherSite } from '@/components/template/SiteSwitcher';

// Seções de formulário e moldura na vitrine (#390): o `SchemaForm` de tela (cartão e barra fixa,
// como o `CustomerCreate` do Ecme) e em cartão (dentro de outra tela), o rich text com o popover
// de link e a data no fuso do site, ambos registrados pelo `fields` como nas telas, e o
// `SiteSwitcher` aberto e recolhido. Tudo com dados fixos: o envio fica no cliente e devolve o
// sucesso do toast; os sites do seletor levam a `/sites/<id>`, que o E2E não segue.

const MateriaSchema = z.object({
  titulo: z.string().trim().min(1, 'Informe o título'),
  resumo: z.string().optional(),
  destaque: z.boolean(),
});

const MATERIA_LABELS = { titulo: 'Título', resumo: 'Resumo', destaque: 'Destaque na capa' };

const TextoSchema = z.object({ corpo: RichTextSchema });

const TEXTO = {
  corpo: [
    { type: 'paragraph', children: [{ type: 'text', text: 'Texto de exemplo para o link.' }] },
  ],
};

const AgendaSchema = z.object({ publicarEm: IsoDateTimeSchema });

const FUSO = 'America/Sao_Paulo';

const RECEITAS: SwitcherSite = { id: 'receitas-da-vo', name: 'Receitas da Vó' };
const VIAGEM: SwitcherSite = { id: 'viagem-leve', name: 'Viagem Leve' };
const SITES = [RECEITAS, VIAGEM, { id: 'casa-e-jardim', name: 'Casa e Jardim' }];

const salvo = (mensagem: string) => () => ({ success: mensagem });

export function FormsShowcase() {
  return (
    <>
      <section aria-labelledby="vitrine-schema-form" className="space-y-3">
        <h2 id="vitrine-schema-form" className="text-lg font-semibold">
          SchemaForm
        </h2>
        <h3 className="font-semibold">Formulário de tela</h3>
        <SchemaForm
          schema={MateriaSchema}
          defaultValues={{ titulo: '', resumo: '', destaque: false }}
          labels={MATERIA_LABELS}
          hints={{ resumo: 'Aparece na lista e no compartilhamento.' }}
          actionBar={{ kind: 'create', href: '/teste-de-componentes' }}
          submitLabel="Criar matéria"
          onSubmit={salvo('Matéria criada.')}
        />
        <h3 className="font-semibold">Formulário em cartão</h3>
        <SchemaForm
          schema={MateriaSchema}
          defaultValues={{ titulo: 'Matéria de exemplo', resumo: '', destaque: true }}
          labels={MATERIA_LABELS}
          card={{ intro: <p className="text-sm">Edição rápida, dentro de outra tela.</p> }}
          submitLabel="Salvar matéria"
          onSubmit={salvo('Matéria salva.')}
        />
      </section>

      <section aria-labelledby="vitrine-rich-text" className="space-y-3">
        <h2 id="vitrine-rich-text" className="text-lg font-semibold">
          Rich text e link
        </h2>
        <SchemaForm
          schema={TextoSchema}
          defaultValues={TEXTO}
          labels={{ corpo: 'Corpo do texto' }}
          fields={{ corpo: richTextField('richText') }}
          card={{}}
          submitLabel="Salvar texto"
          onSubmit={salvo('Texto salvo.')}
        />
      </section>

      <section aria-labelledby="vitrine-data-fuso" className="space-y-3">
        <h2 id="vitrine-data-fuso" className="text-lg font-semibold">
          Data com fuso
        </h2>
        <SchemaForm
          schema={AgendaSchema}
          defaultValues={{ publicarEm: '2026-07-15T13:00:00-03:00' }}
          labels={{ publicarEm: 'Publicar em' }}
          hints={{ publicarEm: 'Hora de São Paulo, o fuso do site.' }}
          fields={{ publicarEm: zonedDateTimeField(FUSO) }}
          card={{}}
          submitLabel="Agendar"
          onSubmit={salvo('Publicação agendada.')}
        />
      </section>

      <section aria-labelledby="vitrine-site-switcher" className="space-y-3">
        <h2 id="vitrine-site-switcher" className="text-lg font-semibold">
          SiteSwitcher
        </h2>
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-64">
            <SiteSwitcher current={RECEITAS} sites={SITES} />
          </div>
          <SiteSwitcher current={VIAGEM} sites={SITES} collapsed />
        </div>
      </section>
    </>
  );
}
