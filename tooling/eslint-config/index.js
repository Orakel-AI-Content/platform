// Presets de ESLint por camada (ADR 0003). Cada unidade escolhe o da sua camada:
//
//   import { layer } from '@orakel/eslint-config';
//   export default layer('domain', import.meta.dirname);
//
// Camadas: domain (packages agnósticos), ui (packages/ui), adapter (adapters/*),
// app (apps/*). Exceções pontuais (ex.: o subcaminho /astro de content-client)
// ficam num bloco extra no eslint.config.js da própria unidade.
import js from '@eslint/js';
import astroPlugin from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ignores = {
  ignores: [
    '**/dist/**',
    '**/dist-examples/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/.next/**',
    '**/.astro/**',
    '**/.wrangler/**',
    '**/dist-preview/**',
  ],
};

const APPS = ['@orakel/blog', '@orakel/blog-worker', '@orakel/backoffice', '@orakel/generator'];

/** Importações proibidas em qualquer camada: apps e caminhos internos de outros pacotes. */
const always = [
  { group: ['**/apps/**'], message: 'Nunca importe de um app; extraia para um pacote.' },
  { group: ['@orakel/*/src/**'], message: 'Importe pelo exports do pacote, não por src/.' },
  ...APPS.map((name) => ({ group: [name, `${name}/**`], message: 'Nunca importe de um app.' })),
];

const react = {
  group: ['react', 'react/**', 'react-dom', 'react-dom/**'],
  message: 'React só em packages/ui e nos apps.',
};
const astro = {
  group: ['astro', 'astro/**', 'astro:*', '@astrojs/**'],
  message: 'Astro só em adapters/astro e em @orakel/content-client/astro.',
};
const next = { group: ['next', 'next/**'], message: 'Next só em apps/backoffice.' };

const forbidden = {
  domain: [react, astro, next],
  ui: [astro, next],
  adapter: [next],
  app: [],
};

/** Só JavaScript, sem informação de tipos — para arquivos de configuração. */
export const javascript = [
  ignores,
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  prettier,
];

/**
 * @param {'domain' | 'ui' | 'adapter' | 'app'} name camada da unidade
 * @param {string} tsconfigRootDir pasta da unidade (import.meta.dirname)
 */
export function layer(name, tsconfigRootDir) {
  return tseslint.config(
    ignores,
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        'no-restricted-imports': ['error', { patterns: [...always, ...forbidden[name]] }],
      },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
    prettier,
  );
}

/**
 * Componentes .astro (apps/blog): regras do eslint-plugin-astro, sem as que exigem tipos
 * (o typecheck dos .astro é do `astro check`). Use depois de `layer('app', …)`.
 */
export const astroComponents = tseslint.config(...astroPlugin.configs['flat/recommended'], {
  files: ['**/*.astro'],
  extends: [tseslint.configs.disableTypeChecked],
});
