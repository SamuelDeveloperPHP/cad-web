import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.js';
import { migrationsFolder } from './paths.js';
import { env } from '../env.js';

// Aplica as migrations pendentes no PostgreSQL configurado em DATABASE_URL.
async function main(): Promise<void> {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL nao configurada');
  }

  const { db, pool } = createDb(env.databaseUrl);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log('[api] migrations aplicadas com sucesso.');
}

main().catch((err: unknown) => {
  console.error('[api] falha ao aplicar migrations:', err);
  process.exitCode = 1;
});
