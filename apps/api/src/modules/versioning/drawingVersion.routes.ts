import express from 'express';
import type { Request, Response, Router } from 'express';
import type { AppDeps } from '../../app.js';
import { checkoutSchema, createBranchSchema, createCommitSchema } from './versioning.schemas.js';
import { findDrawing, updateDrawing } from '../../repositories/drawings.repo.js';
import {
  createBranch,
  ensureMainBranch,
  findBranch,
  findBranchByName,
  listBranches,
  setBranchHead,
} from '../../repositories/branches.repo.js';
import { createCommit, findCommit } from '../../repositories/commits.repo.js';

/**
 * Rotas de versionamento ligadas a um desenho (branches, commits e checkout).
 * Montada em `/drawings`, sob um router ja autenticado; tudo isolado por tenant.
 */
export function drawingVersionRoutes({ db }: AppDeps): Router {
  const router = express.Router();
  // Os corpos aqui sao pequenos (o documento ja esta guardado no desenho).
  router.use(express.json({ limit: '64kb' }));

  // Lista as branches do desenho (garante a main).
  router.get('/:drawingId/branches', async (req: Request<{ drawingId: string }>, res: Response) => {
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
    await ensureMainBranch(db, auth.tenantId, drawing.id);
    const list = await listBranches(db, auth.tenantId, drawing.id);
    res.json({ branches: list });
  });

  // Cria uma branch a partir de um commit (ou do head da main).
  router.post('/:drawingId/branches', async (req: Request<{ drawingId: string }>, res: Response) => {
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
    const parsed = createBranchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }

    let headCommitId: string | null;
    if (parsed.data.fromCommitId !== undefined) {
      const commit = await findCommit(db, auth.tenantId, parsed.data.fromCommitId);
      if (!commit || commit.drawingId !== drawing.id) {
        res.status(404).json({ error: 'NotFound', message: 'Commit de origem nao encontrado' });
        return;
      }
      headCommitId = commit.id;
    } else {
      const main = await ensureMainBranch(db, auth.tenantId, drawing.id);
      headCommitId = main.headCommitId;
    }

    if (await findBranchByName(db, auth.tenantId, drawing.id, parsed.data.name)) {
      res.status(409).json({ error: 'Conflict', message: 'Ja existe uma branch com esse nome' });
      return;
    }

    const branch = await createBranch(db, auth.tenantId, {
      drawingId: drawing.id,
      name: parsed.data.name,
      headCommitId,
    });
    res.status(201).json({ branch });
  });

  // Cria um commit: snapshot do documento atual do desenho na branch indicada.
  router.post('/:drawingId/commits', async (req: Request<{ drawingId: string }>, res: Response) => {
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
    const parsed = createCommitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }
    const branch = await findBranch(db, auth.tenantId, parsed.data.branchId);
    if (!branch || branch.drawingId !== drawing.id) {
      res.status(404).json({ error: 'NotFound', message: 'Branch nao encontrada' });
      return;
    }

    const commit = await createCommit(db, auth.tenantId, {
      drawingId: drawing.id,
      branchId: branch.id,
      parentId: branch.headCommitId,
      authorId: auth.id,
      message: parsed.data.message,
      document: drawing.document,
    });
    await setBranchHead(db, auth.tenantId, branch.id, commit.id);

    res.status(201).json({
      commit: {
        id: commit.id,
        parentId: commit.parentId,
        branchId: commit.branchId,
        message: commit.message,
        authorId: commit.authorId,
        createdAt: commit.createdAt,
      },
    });
  });

  // Checkout: restaura o documento de trabalho do desenho para um commit.
  router.post('/:drawingId/checkout', async (req: Request<{ drawingId: string }>, res: Response) => {
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
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }
    const commit = await findCommit(db, auth.tenantId, parsed.data.commitId);
    if (!commit || commit.drawingId !== drawing.id) {
      res.status(404).json({ error: 'NotFound', message: 'Commit nao encontrado' });
      return;
    }

    const updated = await updateDrawing(db, auth.tenantId, drawing.id, {
      document: commit.document,
    });
    res.json({ drawing: updated });
  });

  return router;
}
