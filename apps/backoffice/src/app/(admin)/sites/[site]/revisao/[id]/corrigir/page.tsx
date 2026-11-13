import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentEditor } from '@/components/contents/ContentEditor';
import { CONTENT_STATUS_LABEL } from '@/components/shared/siteLabels.ts';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { ForbiddenScreen, noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageMeta } from '@/components/shared/PageMeta';
import { siteTrail } from '@/components/shared/trail.ts';

import { itemTitle } from '../../../item-title.ts';
import { previewUrl } from '../../../conteudos/content-urls.ts';
import { readContentVersions } from '../../../conteudos/content-versions.ts';
import { editorOptions } from '../../../conteudos/editor-options.ts';
import { positiveInt } from '../../../conteudos/params.ts';
import { amendAction } from '../../actions.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ site: string; id: string }> };

/** "<título> · Corrigir", só quando a página mostraria o editor. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  const read = contentId === undefined ? undefined : await readContentVersions(siteId, contentId);
  const latest =
    read?.versions.ok && can(read.actor, 'content.amend') ? read.versions.value.at(-1) : undefined;
  return {
    title: itemTitle(latest?.status === 'em_revisao' ? latest.data.title : undefined, 'Corrigir'),
  };
}

/**
 * Correção na revisão (#751, ADR 0022): o editor no modo `amend`, a partir da versão mais
 * recente, que precisa estar em revisão. Salvar grava a N+1 já em revisão (`amendInReview`) e
 * volta à revisão. Sem `content.amend`, ou com a versão fora de revisão, a tela de sem
 * permissão; o domínio confere tudo de novo ao salvar.
 */
export default async function AmendContentPage({ params }: Params) {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { actor, versions, site, timeZone } = read;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  const latest = versions.value.at(-1);
  if (latest === undefined) notFound();
  // "Voltar" e o destino de salvar: a revisão do conteúdo, o nível anterior da trilha.
  const back = `/sites/${siteId}/revisao/${contentId}`;
  if (!can(actor, 'content.amend')) {
    return (
      <ForbiddenScreen action="content.amend" back={{ href: back, label: 'Voltar à revisão' }} />
    );
  }
  if (latest.status !== 'em_revisao') {
    return (
      <ForbiddenScreen
        action="content.amend"
        reason={`Só a versão em revisão pode ser corrigida; a versão ${latest.version} está com o status ${CONTENT_STATUS_LABEL[latest.status]}.`}
        back={{ href: back, label: 'Voltar à revisão' }}
      />
    );
  }
  const options = await editorOptions(getDb().db, actor, siteId);
  if (options === undefined) return noRead;

  return (
    <section aria-labelledby="amend-content-title" className="space-y-4">
      <div className="list-width space-y-4">
        <PageHeader
          id="amend-content-title"
          trail={siteTrail(site, { label: 'Revisão', segment: 'revisao' }, [
            { label: latest.data.title, href: back },
            { label: 'Corrigir' },
          ])}
          title={<>Corrigir “{latest.data.title}”</>}
        />
        <PageMeta
          items={[
            `Corrigindo a versão ${latest.version}, em revisão`,
            `Salvar grava a versão ${latest.version + 1} em revisão`,
          ]}
        />
      </div>
      <ContentEditor
        mode="amend"
        siteId={siteId}
        backHref={back}
        contentClassName="list-width"
        timeZone={timeZone}
        defaultValues={latest.data}
        options={options}
        action={amendAction.bind(null, siteId, contentId, latest.version)}
        previewUrl={previewUrl(siteId, latest.data)}
      />
    </section>
  );
}
