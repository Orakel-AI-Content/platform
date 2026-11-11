import { GenerationForm } from '@/components/generation/GenerationForm';
import { GenerationRunsTable } from '@/components/generation/GenerationRunsTable';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import { siteTrail } from '@/components/shared/trail.ts';
import { currentEditorialContext } from '@/domain/generation/editorial-contexts.ts';
import { listGenerationRuns } from '@/domain/generation/runs.ts';

import { readAuthors, sitePageContext } from '../editorial-page.tsx';
import { enqueueGenerationAction } from './actions.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Geração' };

/**
 * Geração de artigos do site (R1, R5): o disparo, um tema por vez, acima da lista das
 * execuções com o custo. Ver exige site.read; disparar, content.write (o formulário só aparece
 * com ela, e o domínio confere de novo; sem contexto editorial, o aviso aparece para todos). A
 * lista não se atualiza sozinha: quem dispara recarrega.
 */
export default async function GenerationPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const runs = await listGenerationRuns(db, actor, site.id);
  if (!runs.ok) return noRead;

  // O contexto vale para qualquer papel (#600): sem ele, o aviso aparece também para quem só
  // lê, e o estado vazio das execuções não manda gerar. Os autores, só para quem dispara.
  const [authors, current] = await Promise.all([
    canWrite ? readAuthors(site.id) : undefined,
    currentEditorialContext(db, site.id),
  ]);
  const form = (
    <GenerationForm
      siteId={site.id}
      canWrite={canWrite}
      authors={
        authors?.ok ? authors.value.map((author) => ({ id: author.id, label: author.name })) : []
      }
      context={current && { version: current.version }}
      action={enqueueGenerationAction.bind(null, site.id)}
    />
  );

  return (
    <section aria-labelledby="generation-title" className="list-width space-y-4">
      <PageHeader id="generation-title" trail={siteTrail(site, 'Geração')} title="Geração" />
      {form}
      <AdaptiveCard>
        <section aria-labelledby="generation-runs-title" className="flex flex-col gap-4">
          <h2 id="generation-runs-title" className={SECTION_TITLE_CLASS}>
            Execuções
          </h2>
          <GenerationRunsTable
            siteId={site.id}
            timeZone={site.timeZone}
            rows={runs.value}
            hasContext={current !== undefined}
            labelledBy="generation-runs-title"
          />
        </section>
      </AdaptiveCard>
    </section>
  );
}
