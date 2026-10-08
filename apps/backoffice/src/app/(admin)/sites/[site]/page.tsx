import Link from 'next/link';

import { BuildWindowForm, LifecycleAction, RegisterG1Form } from '@/components/site-actions';
import { formatDateTime, formatDuration, LIFECYCLE_LABEL } from '@/components/site-labels.ts';
import { buttonVariants } from '@/components/ui/button';
import { can } from '@/domain/access/rbac.ts';
import { listPolicyTriggers } from '@/domain/sites/policy-triggers.ts';

import { advanceLifecycleAction, registerG1Action, setBuildWindowAction } from '../actions.ts';
import { sitePageContext } from './editorial-page.tsx';

export const dynamic = 'force-dynamic';

/**
 * Página do site: ciclo de vida, registro do G1 e janela de agrupamento. Lê o site pelo
 * sitePageContext (a mesma busca do layout) e os gatilhos; as ações só aparecem com site.configure e o domínio
 * confere de novo.
 */
export default async function SitePage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;
  const triggers = await listPolicyTriggers(db, actor, siteId);
  const g1 = triggers.ok ? triggers.value.find((record) => record.trigger === 'G1') : undefined;
  const canConfigure = can(actor, 'site.configure');
  const canWriteContent = can(actor, 'content.write');

  const sectionClass = 'space-y-3 rounded-md border border-border p-4';
  return (
    <section aria-labelledby="site-title" className="form-width space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="site-title" className="text-2xl font-semibold">
          {site.name} <span className="text-muted-foreground">({site.id})</span>
        </h1>
        {canConfigure && (
          <Link
            href={`/sites/${site.id}/configuracao`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Editar configuração
          </Link>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {site.domain} · Indexável: {site.indexavel ? 'sim' : 'não'}
      </p>

      <nav aria-label="Conteúdo editorial do site">
        <ul className="flex flex-wrap gap-2">
          {[
            ['conteudos', 'Conteúdos'],
            ['revisao', 'Revisão'],
            ['midia', 'Mídia'],
            ['autores', 'Autores'],
            ['taxonomias', 'Taxonomias'],
            ['menus', 'Menus'],
            // Só para quem edita: a tela é um formulário (content.write).
            ...(canWriteContent ? [['institucionais', 'Textos institucionais']] : []),
          ].map(([segment, label]) => (
            <li key={segment}>
              <Link
                href={`/sites/${site.id}/${segment}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="lifecycle-title" className={sectionClass}>
        <h2 id="lifecycle-title" className="text-lg font-semibold">
          Ciclo de vida
        </h2>
        {canConfigure ? (
          <LifecycleActionScope>
            <LifecycleSteps
              current={site.lifecycle}
              action={
                <LifecycleAction
                  lifecycle={site.lifecycle}
                  action={advanceLifecycleAction.bind(null, site.id)}
                />
              }
            />
          </LifecycleActionScope>
        ) : (
          <LifecycleSteps current={site.lifecycle} />
        )}
      </section>

      <section aria-labelledby="g1-title" className={sectionClass}>
        <h2 id="g1-title" className="text-lg font-semibold">
          G1 (indexação)
        </h2>
        <p className="text-sm text-muted-foreground">
          Registro que libera a indexação do site: sem ele, o site não pode ficar indexável.
        </p>
        {g1 ? (
          <p>
            Registrado por {g1.registeredBy} em {formatDateTime(g1.registeredAt, site.timeZone)}
            {g1.note ? ` — ${g1.note}` : ''}.
          </p>
        ) : (
          <>
            <p>G1 não registrado: o site não pode ficar indexável.</p>
            {canConfigure && <RegisterG1Form action={registerG1Action.bind(null, site.id)} />}
          </>
        )}
      </section>

      <section aria-labelledby="window-title" className={sectionClass}>
        <h2 id="window-title" className="text-lg font-semibold">
          Janela de agrupamento
        </h2>
        <p className="text-sm text-muted-foreground">
          Tempo que as mudanças aguardam antes de virar um build: as que chegam nesse intervalo
          entram no mesmo build.
        </p>
        <p>
          Janela efetiva:{' '}
          <strong>
            {formatDuration(site.effectiveBuildWindowSeconds)},{' '}
            {site.buildWindowSeconds === null ? 'padrão' : 'própria'}
          </strong>
        </p>
        {canConfigure && (
          <BuildWindowForm
            own={site.buildWindowSeconds}
            action={setBuildWindowAction.bind(null, site.id)}
          />
        )}
      </section>
    </section>
  );
}
