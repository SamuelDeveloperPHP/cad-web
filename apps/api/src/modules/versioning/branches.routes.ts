import express from 'express';
import type { Request, Response, Router } from 'express';
import type { AppDeps } from '../../app.js';
import { findBranch } from '../../repositories/branches.repo.js';
import { branchHistory, listDrawingCommitMetas } from '../../repositories/commits.repo.js';

/** Rotas por branch. Montada em `/branches`, sob um router ja autenticado. */
export function branchRoutes({ db }: AppDeps): Router {
  const router = express.Router();

  // Historico de commits da branch (do head ate a raiz, via parent).
  router.get('/:branchId/commits', async (req: Request<{ branchId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const branch = await findBranch(db, auth.tenantId, req.params.branchId);
    if (!branch) {
      res.status(404).json({ error: 'NotFound', message: 'Branch nao encontrada' });
      return;
    }
    const all = await listDrawingCommitMetas(db, auth.tenantId, branch.drawingId);
    const history = branchHistory(all, branch.headCommitId);
    res.json({ commits: history });
  });

  return router;
}
