import express from 'express';
import type { Request, Response, Router } from 'express';
import type { AppDeps } from '../../app.js';
import {
  findTenantById,
  findUserById,
  listUsersInTenant,
  publicTenant,
  publicUser,
} from '../../repositories/users.repo.js';

/**
 * Monta as rotas da conta autenticada: /me e /users. Deve ser montada sob um
 * router ja autenticado (a autenticacao e aplicada uma vez no app).
 */
export function accountRoutes({ db }: AppDeps): Router {
  const router = express.Router();

  // Devolve o usuario autenticado e a empresa dele.
  router.get('/me', async (req: Request, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }

    const user = await findUserById(db, auth.id);
    if (!user) {
      res.status(404).json({ error: 'NotFound', message: 'Usuario nao encontrado' });
      return;
    }

    const tenant = await findTenantById(db, user.tenantId);
    res.json({ user: publicUser(user), tenant: tenant ? publicTenant(tenant) : null });
  });

  // Lista os usuarios da empresa do solicitante (sempre isolado por tenant).
  router.get('/users', async (req: Request, res: Response) => {
    const auth = req.user;
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized', message: 'Nao autenticado' });
      return;
    }

    const list = await listUsersInTenant(db, auth.tenantId);
    res.json({ users: list.map(publicUser) });
  });

  return router;
}
