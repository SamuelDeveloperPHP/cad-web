import express from 'express';
import type { Router } from 'express';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';

/**
 * Monta as rotas de saude do servico: liveness em `/` (o processo esta no ar)
 * e readiness em `/ready` (o processo consegue falar com o banco).
 */
export function createHealthRouter(db: AppDatabase): Router {
  const router = express.Router();

  // Liveness: responde sempre que o processo esta de pe.
  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness: so fica pronto se o banco responde a uma consulta trivial.
  router.get('/ready', async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
