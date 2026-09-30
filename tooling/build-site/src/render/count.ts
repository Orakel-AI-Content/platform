// Páginas (HTML sem a 404) e arquivos do artefato: vão para o result.json e para a trava.
import { readdir } from 'node:fs/promises';
import { relative } from 'node:path';

export async function countArtifact(dir: string): Promise<{ pages: number; files: number }> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const pages = files.filter((entry) => {
    if (!entry.name.endsWith('.html')) return false;
    return relative(dir, `${entry.parentPath}/${entry.name}`) !== '404.html';
  }).length;
  return { pages, files: files.length };
}
