import express from 'express';
import type { Request, Response, Router } from 'express';
import type { AppDeps } from '../../app.js';
import { findCommit } from '../../repositories/commits.repo.js';

/** Rotas por commit. Montada em `/commits`, sob um router ja autenticado. */
export function commitRoutes({ db }: AppDeps): Router {
  const router = express.Router();

  // Devolve um commit completo (com o documento do snapshot).
  router.get('/:commitId', async (req: Request<{ commitId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const commit = await findCommit(db, auth.tenantId, req.params.commitId);
    if (!commit) {
      res.status(404).json({ error: 'NotFound', message: 'Commit nao encontrado' });
      return;
    }
    res.json({ commit });
  });

  return router;
}
