import type { NextFunction, Request, Response } from 'express';

// Trata erros nao capturados e devolve uma resposta JSON padronizada.
// Mantem a assinatura de quatro argumentos que o Express exige para
// reconhecer o middleware como tratador de erros.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : 'Erro interno inesperado';

  // Registra o erro completo no servidor sem expor detalhes ao cliente.
  console.error('[api] erro nao tratado:', err);

  res.status(500).json({ error: 'InternalServerError', message });
}
