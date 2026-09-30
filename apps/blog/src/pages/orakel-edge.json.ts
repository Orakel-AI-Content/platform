// Ponte entre as páginas e a integração do fim do build (ADR 0005 da unidade): gerado com as
// coleções (a mesma leitura do snapshot), lido e apagado por src/integrations/site-files.ts.
// Leva os arquivos da borda do core, o manifesto de eventos, as fontes do tema e o uso de
// redirects para o result.json.
import { contentPath, edgeFiles } from '@orakel/core/v1';
import { EVENT_MANIFEST_PATH, buildEventManifest } from '@orakel/events/v1';
import { isThemeId, themeFonts } from '@orakel/tokens';
import type { APIRoute } from 'astro';

import { loadBuildSite } from '../data/collections.ts';
import { BuildError, permanent } from '../data/errors.ts';
import { searchEnabled } from '../routing/resolve.ts';

export type EdgeBundle = {
  files: { path: string; content: string }[];
  redirectUsage: unknown;
  fonts: { file: string; url: string }[];
  search: boolean;
};

export const GET: APIRoute = async () => {
  if (import.meta.env.BLOG_OUTPUT === 'preview') return new Response(null, { status: 404 });

  const site = await loadBuildSite();
  const edge = edgeFiles(site);
  if (!edge.ok) throw permanent('Arquivos da borda inválidos', edge.issues);
  if (!isThemeId(site.config.theme)) {
    throw new BuildError(`Tema "${site.config.theme}" não existe nesta release`, 'permanent');
  }

  const manifest = buildEventManifest(
    site.contents
      .filter((content) => content.kind === 'article')
      .map((content) => ({ id: content.id, path: contentPath(content) })),
  );
  const bundle: EdgeBundle = {
    files: [...edge.value.files, { path: EVENT_MANIFEST_PATH, content: JSON.stringify(manifest) }],
    redirectUsage: edge.value.redirectUsage,
    fonts: (themeFonts(site.config.theme) ?? []).map(({ file, url }) => ({ file, url })),
    search: searchEnabled(site.config),
  };
  return Response.json(bundle);
};
