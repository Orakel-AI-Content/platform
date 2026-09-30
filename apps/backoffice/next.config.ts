import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Variáveis do .env.local da raiz do monorepo (a mesma fonte do compose e dos scripts).
loadEnvConfig(root);

const nextConfig: NextConfig = {
  output: 'standalone',
  // Rastreia os arquivos a partir da raiz do monorepo (pacotes do workspace).
  outputFileTracingRoot: root,
  // Pacotes do workspace são consumidos como fonte TypeScript (ADR 0003 da raiz).
  transpilePackages: ['@orakel/content-model'],
  // Dependências só do servidor: não entram no bundle.
  serverExternalPackages: ['pg', 'pino', 'graphile-worker'],
  // O repositório não usa AGENTS.md; a orientação está em .claude/rules/next.md.
  agentRules: false,
  poweredByHeader: false,
};

export default nextConfig;
