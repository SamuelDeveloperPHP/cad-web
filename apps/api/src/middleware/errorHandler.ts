import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';

// Trata erros nao capturados e devolve uma resposta JSON padronizada.
// Mantem a assinatura de quatro argumentos que o Express exige para
// reconhecer o middleware como tratador de erros.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Registra o erro completo no servidor.
  console.error('[api] erro nao tratado:', err);

  // Em producao, nao expoe detalhes internos ao cliente; so uma mensagem generica.
  const message =
    env.nodeEnv === 'production'
      ? 'Erro interno inesperado'
      : err instanceof Error
        ? err.message
        : 'Erro interno inesperado';

  res.status(500).json({ error: 'InternalServerError', message });
}
