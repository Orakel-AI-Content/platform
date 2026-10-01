import { describe, expect, it } from 'vitest';

import type { BuildTarget } from './builds.ts';
import { RENDER_LIMITS, planBuild, type BuildSettings } from './plan.ts';

const target: BuildTarget = {
  siteId: 'exemplo-a',
  state: 'ativo',
  pausedReason: null,
  release: null,
  domain: 'exemplo-a.localhost',
  activePages: undefined,
};

const settings: BuildSettings = {
  image: 'ghcr.io/orakel-ai-content/site-builder',
  defaultTag: 'local',
  exportNetwork: 'orakel-export',
  publishNetwork: 'orakel-publish',
  exportApiUrl: 'http://backoffice-web:3000',
  exportBuildToken: 'b'.repeat(32),
  pageDropTolerance: 0.2,
  deploy: { target: 'cloudflare', apiToken: 't'.repeat(40), accountId: 'a'.repeat(32) },
  s3: { endpoint: 'http://s3:8333', accessKeyId: 'k', secretAccessKey: 's' },
};

describe('planBuild', () => {
  it('sem release registrada, usa a tag padrão; com release, a do site', () => {
    expect(planBuild(target, settings, 'r').image).toBe(
      'ghcr.io/orakel-ai-content/site-builder:local',
    );
    expect(planBuild({ ...target, release: 'core-v0.2.0' }, settings, 'r')).toMatchObject({
      release: 'core-v0.2.0',
      image: 'ghcr.io/orakel-ai-content/site-builder:core-v0.2.0',
    });
  });

  it('o token de deploy só vai para o publish; o do build, só para o render', () => {
    const plan = planBuild(target, settings, 'r');
    expect(plan.render.env).not.toHaveProperty('CLOUDFLARE_API_TOKEN');
    expect(plan.render.env).not.toHaveProperty('S3_SECRET_ACCESS_KEY');
    expect(plan.publish.env).toHaveProperty('CLOUDFLARE_API_TOKEN');
    expect(plan.publish.env).not.toHaveProperty('EXPORT_BUILD_TOKEN');
    expect(plan.render).toMatchObject({ network: 'orakel-export', limits: RENDER_LIMITS });
    expect(plan.publish.network).toBe('orakel-publish');
  });

  it('a trava recebe as páginas da versão ativa, quando houver', () => {
    expect(planBuild(target, settings, 'r').render.env).not.toHaveProperty('ACTIVE_PAGE_COUNT');
    expect(planBuild({ ...target, activePages: 120 }, settings, 'r').render.env).toMatchObject({
      ACTIVE_PAGE_COUNT: '120',
      PAGE_DROP_TOLERANCE: '0.2',
    });
  });
});
