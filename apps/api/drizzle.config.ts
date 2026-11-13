import { defineConfig } from 'drizzle-kit';

// Configuracao do drizzle-kit para gerar e aplicar migrations do PostgreSQL.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
});
