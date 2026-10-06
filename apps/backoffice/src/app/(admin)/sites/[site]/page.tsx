import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentActor } from '@/auth/request-actor.ts';
import { BuildWindowForm, LifecycleAction, RegisterG1Form } from '@/components/site-actions';
import { LIFECYCLE_LABEL } from '@/components/site-labels.ts';
import { buttonVariants } from '@/components/ui/button';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { listPolicyTriggers } from '@/domain/sites/policy-triggers.ts';
import { listSites } from '@/domain/sites/sites.ts';

import { advanceLifecycleAction, registerG1Action, setBuildWindowAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Site · Orakel Backoffice' };

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/**
 * Página do site: ciclo de vida, registro do G1 e janela de agrupamento. Lê pelo listSites
 * (5 a 20 sites) e pelos gatilhos; as ações só aparecem com site.configure e o domínio
 * confere de novo.
 */
export default async function SitePage({ params }: { params: Promise<{ site: string }> }) {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const { site: siteId } = await params;
  const db = getDb().db;
  const sites = await listSites(db, actor.value);
  if (!sites.ok) return <p role="alert">Sem permissão para ver os sites.</p>;
  const site = sites.value.find((summary) => summary.id === siteId);
  if (site === undefined) notFound();
  const triggers = await listPolicyTriggers(db, actor.value, siteId);
  const g1 = triggers.ok ? triggers.value.find((record) => record.trigger === 'G1') : undefined;
  const canConfigure = can(actor.value, 'site.configure');
  const canWriteContent = can(actor.value, 'content.write');

  const sectionClass = 'space-y-3 rounded-md border border-border p-4';
  return (
    <section aria-labelledby="site-title" className="max-w-3xl space-y-6">
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
        <p>
          Etapa atual: <strong>{LIFECYCLE_LABEL[site.lifecycle]}</strong>
        </p>
        {canConfigure && (
          <LifecycleAction
            lifecycle={site.lifecycle}
            action={advanceLifecycleAction.bind(null, site.id)}
          />
        )}
      </section>

      <section aria-labelledby="g1-title" className={sectionClass}>
        <h2 id="g1-title" className="text-lg font-semibold">
          G1 (indexação)
        </h2>
        {g1 ? (
          <p>
            Registrado por {g1.registeredBy} em {dateTime.format(g1.registeredAt)}
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
        <p>
          Janela efetiva:{' '}
          <strong>
            {site.effectiveBuildWindowSeconds} s (
            {site.buildWindowSeconds === null ? 'padrão' : 'própria'})
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
