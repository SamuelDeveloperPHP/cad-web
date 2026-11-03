import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createApp } from '../app.js';
import type { AppDatabase } from '../db/client.js';
import { migrationsFolder } from '../db/paths.js';
import * as schema from '../db/schema.js';

/** Backend de teste com um PostgreSQL em memoria (PGlite) ja migrado. */
export interface TestApp {
  app: ReturnType<typeof createApp>;
  db: AppDatabase;
  jwtSecret: string;
  close: () => Promise<void>;
}

/** Cria um backend isolado para testes, com banco proprio e migrado. */
export async function makeTestApp(): Promise<TestApp> {
  const client = new PGlite();
  const pgliteDb = drizzle(client, { schema });
  await migrate(pgliteDb, { migrationsFolder });

  // O Drizzle do PGlite expoe a mesma API do node-postgres em runtime.
  const db = pgliteDb as unknown as AppDatabase;
  const jwtSecret = 'test-secret-cad-web';
  const app = createApp({ db, jwtSecret });

  return {
    app,
    db,
    jwtSecret,
    close: async () => {
      await client.close();
    },
  };
}
