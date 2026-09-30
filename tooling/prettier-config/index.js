/** @type {import('prettier').Config} */
export default {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
  // Componentes .astro (apps/blog). O plugin é dependência deste pacote.
  plugins: [import.meta.resolve('prettier-plugin-astro')],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};
