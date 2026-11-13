import express from 'express';
import type { Request, Response, Router } from 'express';
import type { AppDeps } from '../../app.js';
import { createMergeRequestSchema, mergeSchema, reviewSchema } from './versioning.schemas.js';
import { findDrawing } from '../../repositories/drawings.repo.js';
import { findBranch, setBranchHead } from '../../repositories/branches.repo.js';
import { createCommit, findMergeBase, listDrawingCommitMetas } from '../../repositories/commits.repo.js';
import {
  addReview,
  createMergeRequest,
  findMergeRequest,
  listMergeRequests,
  listReviews,
  updateMergeRequest,
} from '../../repositories/mergeRequests.repo.js';

/**
 * Merge requests ligados a um desenho. Montada em `/drawings`, sob um router ja
 * autenticado; tudo isolado por tenant.
 */
export function drawingMergeRequestRoutes({ db }: AppDeps): Router {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  // Abre um merge request de uma branch de origem para uma de destino.
  router.post(
    '/:drawingId/merge-requests',
    async (req: Request<{ drawingId: string }>, res: Response) => {
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
      const parsed = createMergeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
        return;
      }
      if (parsed.data.sourceBranchId === parsed.data.targetBranchId) {
        res.status(422).json({ error: 'ValidationError', message: 'Origem e destino iguais' });
        return;
      }
      const source = await findBranch(db, auth.tenantId, parsed.data.sourceBranchId);
      const target = await findBranch(db, auth.tenantId, parsed.data.targetBranchId);
      if (!source || !target || source.drawingId !== drawing.id || target.drawingId !== drawing.id) {
        res.status(404).json({ error: 'NotFound', message: 'Branch de origem/destino invalida' });
        return;
      }

      const mergeRequest = await createMergeRequest(db, auth.tenantId, {
        drawingId: drawing.id,
        sourceBranchId: source.id,
        targetBranchId: target.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        authorId: auth.id,
      });
      res.status(201).json({ mergeRequest });
    },
  );

  // Lista os merge requests do desenho.
  router.get(
    '/:drawingId/merge-requests',
    async (req: Request<{ drawingId: string }>, res: Response) => {
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
      const list = await listMergeRequests(db, auth.tenantId, drawing.id);
      res.json({ mergeRequests: list });
    },
  );

  return router;
}

/**
 * Acoes sobre um merge request por id (detalhe, revisao e merge). Montada em
 * `/merge-requests`, sob um router ja autenticado.
 */
export function mergeRequestRoutes({ db }: AppDeps): Router {
  const router = express.Router();
  // O merge carrega o documento ja mesclado (pode ser grande).
  router.use(express.json({ limit: '25mb' }));

  // Detalha um MR: branches, heads, base de merge (LCA) e revisoes.
  router.get('/:mergeRequestId', async (req: Request<{ mergeRequestId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const mergeRequest = await findMergeRequest(db, auth.tenantId, req.params.mergeRequestId);
    if (!mergeRequest) {
      res.status(404).json({ error: 'NotFound', message: 'Merge request nao encontrado' });
      return;
    }
    const source = await findBranch(db, auth.tenantId, mergeRequest.sourceBranchId);
    const target = await findBranch(db, auth.tenantId, mergeRequest.targetBranchId);
    const all = await listDrawingCommitMetas(db, auth.tenantId, mergeRequest.drawingId);
    const baseCommitId = findMergeBase(
      all,
      source?.headCommitId ?? null,
      target?.headCommitId ?? null,
    );
    const reviews = await listReviews(db, auth.tenantId, mergeRequest.id);

    res.json({
      mergeRequest,
      source,
      target,
      sourceHeadCommitId: source?.headCommitId ?? null,
      targetHeadCommitId: target?.headCommitId ?? null,
      baseCommitId,
      reviews,
    });
  });

  // Registra uma revisao (aprovacao/rejeicao) e ajusta o estado do MR.
  router.post(
    '/:mergeRequestId/reviews',
    async (req: Request<{ mergeRequestId: string }>, res: Response) => {
      const auth = req.user;
      if (!auth) {
        res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
        return;
      }
      const mergeRequest = await findMergeRequest(db, auth.tenantId, req.params.mergeRequestId);
      if (!mergeRequest) {
        res.status(404).json({ error: 'NotFound', message: 'Merge request nao encontrado' });
        return;
      }
      if (mergeRequest.status === 'merged') {
        res.status(409).json({ error: 'Conflict', message: 'Merge request ja foi mesclado' });
        return;
      }
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
        return;
      }

      const review = await addReview(db, auth.tenantId, {
        mergeRequestId: mergeRequest.id,
        reviewerId: auth.id,
        decision: parsed.data.decision,
        comment: parsed.data.comment ?? null,
      });
      const status = parsed.data.decision === 'approved' ? 'approved' : 'rejected';
      await updateMergeRequest(db, auth.tenantId, mergeRequest.id, { status });

      res.status(201).json({ review, status });
    },
  );

  // Mescla: grava o documento mesclado como um commit de merge no destino.
  router.post(
    '/:mergeRequestId/merge',
    async (req: Request<{ mergeRequestId: string }>, res: Response) => {
      const auth = req.user;
      if (!auth) {
        res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
        return;
      }
      const mergeRequest = await findMergeRequest(db, auth.tenantId, req.params.mergeRequestId);
      if (!mergeRequest) {
        res.status(404).json({ error: 'NotFound', message: 'Merge request nao encontrado' });
        return;
      }
      if (mergeRequest.status === 'merged') {
        res.status(409).json({ error: 'Conflict', message: 'Merge request ja foi mesclado' });
        return;
      }
      if (mergeRequest.status === 'rejected') {
        res.status(409).json({ error: 'Conflict', message: 'Merge request foi rejeitado' });
        return;
      }
      const parsed = mergeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
        return;
      }
      const source = await findBranch(db, auth.tenantId, mergeRequest.sourceBranchId);
      const target = await findBranch(db, auth.tenantId, mergeRequest.targetBranchId);
      if (!source || !target) {
        res.status(404).json({ error: 'NotFound', message: 'Branch de origem/destino ausente' });
        return;
      }
      if (source.headCommitId === null) {
        res.status(422).json({ error: 'ValidationError', message: 'A origem nao tem commits' });
        return;
      }

      const commit = await createCommit(db, auth.tenantId, {
        drawingId: mergeRequest.drawingId,
        branchId: target.id,
        parentId: target.headCommitId,
        mergeParentId: source.headCommitId,
        authorId: auth.id,
        message: `Merge '${source.name}' em '${target.name}': ${mergeRequest.title}`,
        document: parsed.data.document,
      });
      await setBranchHead(db, auth.tenantId, target.id, commit.id);
      const updated = await updateMergeRequest(db, auth.tenantId, mergeRequest.id, {
        status: 'merged',
        mergeCommitId: commit.id,
      });

      res.json({
        mergeRequest: updated,
        commit: { id: commit.id, branchId: commit.branchId, message: commit.message },
      });
    },
  );

  return router;
}
