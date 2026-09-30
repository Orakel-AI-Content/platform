// Caminhos no layout do workspace, que a imagem site-builder mantém igual ao repositório.
import { fileURLToPath } from 'node:url';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export const REPO_ROOT = at('../../../');
export const BLOG_DIR = at('../../../apps/blog/');
export const WORKER_BASE_CONFIG = at('../../../apps/blog/worker/wrangler.jsonc');
export const WORKER_MAIN = at('../../../apps/blog/worker/src/index.ts');
export const BLOG_PREVIEW_ENTRY = at('../../../apps/blog/dist-preview/server/entry.mjs');
export const WRANGLER_BIN = at('../node_modules/.bin/wrangler');
