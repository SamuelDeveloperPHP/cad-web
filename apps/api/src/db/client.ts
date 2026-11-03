import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

/** Tipo do banco usado em toda a aplicacao (Drizzle sobre node-postgres). */
export type AppDatabase = NodePgDatabase<typeof schema>;

/** Cria o pool de conexoes e a instancia Drizzle a partir da string de conexao. */
export function createDb(connectionString: string): { db: AppDatabase; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
