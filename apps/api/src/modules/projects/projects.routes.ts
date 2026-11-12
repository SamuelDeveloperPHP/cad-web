import express from 'express';
import type { Request, Response, Router } from 'express';
import type { AppDeps } from '../../app.js';
import { createProjectSchema, updateProjectSchema } from './projects.schemas.js';
import { createDrawingSchema } from '../drawings/drawings.schemas.js';
import {
  createProject,
  deleteProject,
  findProject,
  listProjects,
  updateProject,
} from '../../repositories/projects.repo.js';
import { createDrawing, listDrawingsMeta } from '../../repositories/drawings.repo.js';

/**
 * Monta as rotas de projetos (e os desenhos de um projeto). Deve ser montada
 * sob um router ja autenticado: todas as acoes usam `req.user.tenantId`.
 */
export function projectRoutes({ db }: AppDeps): Router {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));

  // Cria um projeto na empresa do solicitante.
  router.post('/', async (req: Request, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }
    const project = await createProject(db, auth.tenantId, parsed.data.name);
    res.status(201).json({ project });
  });

  // Lista os projetos da empresa.
  router.get('/', async (req: Request, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const list = await listProjects(db, auth.tenantId);
    res.json({ projects: list });
  });

  // Detalha um projeto da empresa.
  router.get('/:projectId', async (req: Request<{ projectId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const project = await findProject(db, auth.tenantId, req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'NotFound', message: 'Projeto nao encontrado' });
      return;
    }
    res.json({ project });
  });

  // Renomeia um projeto da empresa.
  router.patch('/:projectId', async (req: Request<{ projectId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }
    const project = await updateProject(db, auth.tenantId, req.params.projectId, parsed.data.name);
    if (!project) {
      res.status(404).json({ error: 'NotFound', message: 'Projeto nao encontrado' });
      return;
    }
    res.json({ project });
  });

  // Remove um projeto da empresa (e seus desenhos, por cascade).
  router.delete('/:projectId', async (req: Request<{ projectId: string }>, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }
    const removed = await deleteProject(db, auth.tenantId, req.params.projectId);
    if (!removed) {
      res.status(404).json({ error: 'NotFound', message: 'Projeto nao encontrado' });
      return;
    }
    res.status(204).send();
  });

  // Cria um desenho dentro de um projeto da empresa.
  router.post(
    '/:projectId/drawings',
    async (req: Request<{ projectId: string }>, res: Response) => {
      const auth = req.user;
      if (!auth) {
        res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
        return;
      }
      const project = await findProject(db, auth.tenantId, req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'NotFound', message: 'Projeto nao encontrado' });
        return;
      }
      const parsed = createDrawingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
        return;
      }
      const drawing = await createDrawing(db, auth.tenantId, {
        projectId: project.id,
        name: parsed.data.name,
        document: parsed.data.document ?? {},
      });
      res.status(201).json({ drawing });
    },
  );

  // Lista os desenhos de um projeto (so metadados).
  router.get(
    '/:projectId/drawings',
    async (req: Request<{ projectId: string }>, res: Response) => {
      const auth = req.user;
      if (!auth) {
        res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
        return;
      }
      const project = await findProject(db, auth.tenantId, req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'NotFound', message: 'Projeto nao encontrado' });
        return;
      }
      const list = await listDrawingsMeta(db, auth.tenantId, project.id);
      res.json({ drawings: list });
    },
  );

  return router;
}
