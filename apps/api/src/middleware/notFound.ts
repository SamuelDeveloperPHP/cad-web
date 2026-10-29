import type { Request, Response } from 'express';

// Responde 404 em JSON para qualquer rota que nao foi registrada.
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NotFound',
    message: `Rota nao encontrada: ${req.method} ${req.originalUrl}`,
  });
}
