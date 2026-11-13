import express from 'express';
import type { Request, Response, Router } from 'express';
import type { AppDeps } from '../../app.js';
import { updateDrawingSchema } from './drawings.schemas.js';
import {
  deleteDrawing,
  findDrawing,
  updateDrawing,
  type UpdateDrawingPatch,
} from '../../repositories/drawings.repo.js';

// Desenhos CAD podem ser grandes; o corpo aceita ate 25 MB.
const DRAWING_BODY_LIMIT = '25mb';

/**
 * Monta as rotas de um desenho por id. Deve ser montada sob um router ja
 * autenticado: todas as acoes usam `req.user.tenantId` para isolar a empresa.
 */
export function drawingRoutes({ db }: AppDeps): Router {
  const router = express.Router();
  router.use(express.json({ limit: DRAWING_BODY_LIMIT }));

  // Devolve um desenho completo (com o documento).
  router.get('/:drawingId', async (req: Request<{ drawingId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const drawing = await findDrawing(db, auth.tenantId, req.params.drawingId);
    if (!drawing) {
      res.status(404).json({ error: 'NotFound', message: 'Desenho nao encontrado' });
      return;
    }
    res.json({ drawing });
  });

  // Salva um desenho (documento obrigatorio; nome opcional).
  router.put('/:drawingId', async (req: Request<{ drawingId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const parsed = updateDrawingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }
    const patch: UpdateDrawingPatch = { document: parsed.data.document };
    if (parsed.data.name !== undefined) {
      patch.name = parsed.data.name;
    }
    const drawing = await updateDrawing(db, auth.tenantId, req.params.drawingId, patch);
    if (!drawing) {
      res.status(404).json({ error: 'NotFound', message: 'Desenho nao encontrado' });
      return;
    }
    res.json({ drawing });
  });

  // Remove um desenho da empresa.
  router.delete('/:drawingId', async (req: Request<{ drawingId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const removed = await deleteDrawing(db, auth.tenantId, req.params.drawingId);
    if (!removed) {
      res.status(404).json({ error: 'NotFound', message: 'Desenho nao encontrado' });
      return;
    }
    res.status(204).send();
  });

  return router;
}
