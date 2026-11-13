import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Logger } from 'pino';
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

/** Ajustes opcionais para exercitar o hardening (rate limit, CORS, logger). */
export interface TestAppOverrides {
  rateLimit?: boolean;
  corsOrigins?: readonly string[];
  logger?: Logger;
}

/** Cria um backend isolado para testes, com banco proprio e migrado. */
export async function makeTestApp(overrides: TestAppOverrides = {}): Promise<TestApp> {
  const client = new PGlite();
  const pgliteDb = drizzle(client, { schema });
  await migrate(pgliteDb, { migrationsFolder });

  // O Drizzle do PGlite expoe a mesma API do node-postgres em runtime.
  const db = pgliteDb as unknown as AppDatabase;
  const jwtSecret = 'test-secret-cad-web';

  // O rate limit fica desligado por padrao para nao interferir nos testes.
  const app = createApp({
    db,
    jwtSecret,
    rateLimit: overrides.rateLimit ?? false,
    ...(overrides.corsOrigins ? { corsOrigins: overrides.corsOrigins } : {}),
    ...(overrides.logger ? { logger: overrides.logger } : {}),
  });

  return {
    app,
    db,
    jwtSecret,
    close: async () => {
      await client.close();
    },
  };
}
