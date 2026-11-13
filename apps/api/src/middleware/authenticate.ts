import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../modules/auth/auth.service.js';

/** Cria o middleware que valida o JWT do cabecalho Authorization: Bearer. */
export function authenticate(jwtSecret: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized', message: 'Token de acesso ausente' });
      return;
    }

    const token = header.slice('Bearer '.length);
    try {
      const claims = await verifyToken(token, jwtSecret);
      // Disponibiliza a identidade autenticada para os handlers seguintes.
      req.user = { id: claims.sub, tenantId: claims.tid, role: claims.role };
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized', message: 'Token invalido ou expirado' });
    }
  };
}
