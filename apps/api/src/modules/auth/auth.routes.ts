import express from 'express';
import type { Router } from 'express';
import type { AppDeps } from '../../app.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { hashPassword, signToken, verifyPassword } from './auth.service.js';
import {
  createTenantWithAdmin,
  findTenantById,
  findUserByEmail,
  publicTenant,
  publicUser,
} from '../../repositories/users.repo.js';

/** Monta as rotas de autenticacao: registro e login. */
export function authRoutes({ db, jwtSecret }: AppDeps): Router {
  const router = express.Router();
  // Corpos de auth sao pequenos; limita para conter payloads abusivos.
  router.use(express.json({ limit: '64kb' }));

  // Cria uma empresa e seu usuario administrador, devolvendo um token.
  router.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }

    const { tenantName, email, password } = parsed.data;
    if (await findUserByEmail(db, email)) {
      res.status(409).json({ error: 'Conflict', message: 'E-mail ja cadastrado' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const { tenant, user } = await createTenantWithAdmin(db, { tenantName, email, passwordHash });
    const token = await signToken({ sub: user.id, tid: tenant.id, role: user.role }, jwtSecret);

    res.status(201).json({ token, user: publicUser(user), tenant: publicTenant(tenant) });
  });

  // Autentica por e-mail e senha, devolvendo um token.
  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }

    const { email, password } = parsed.data;
    const user = await findUserByEmail(db, email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'Unauthorized', message: 'Credenciais invalidas' });
      return;
    }

    const tenant = await findTenantById(db, user.tenantId);
    const token = await signToken({ sub: user.id, tid: user.tenantId, role: user.role }, jwtSecret);

    res.json({ token, user: publicUser(user), tenant: tenant ? publicTenant(tenant) : null });
  });

  return router;
}
