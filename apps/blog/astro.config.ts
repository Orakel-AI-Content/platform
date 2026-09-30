import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

import { siteFiles } from './src/integrations/site-files.ts';

// Duas saídas do mesmo app (ADR 0002 da unidade):
// - static (padrão): um site por SITE_ID, servido como Worker com Static Assets;
// - preview: SSR multi-site da visualização (`/<site>/<caminho>`), com o adapter Node.
// BLOG_OUTPUT decide só a saída; tema e layout vêm sempre da configuração do site.
const output = process.env.BLOG_OUTPUT === 'preview' ? 'preview' : 'static';

export default defineConfig({
  output: output === 'preview' ? 'server' : 'static',
  ...(output === 'preview' && { adapter: node({ mode: 'standalone' }) }),
  outDir: output === 'preview' ? './dist-preview' : './dist',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: output === 'static' ? [siteFiles()] : [],
  devToolbar: { enabled: false },
  vite: {
    define: { 'import.meta.env.BLOG_OUTPUT': JSON.stringify(output) },
  },
});
