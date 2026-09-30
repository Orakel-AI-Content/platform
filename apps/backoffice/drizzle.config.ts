import { defineConfig } from 'drizzle-kit';

// Migrações SQL geradas em drizzle/ (só aditivas: expand/contract). Aplicadas por db:migrate.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
});
