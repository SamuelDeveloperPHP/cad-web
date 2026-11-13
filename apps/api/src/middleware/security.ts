import cors from 'cors';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

/**
 * Monta o middleware de CORS: restrito as origens informadas em producao, ou
 * permissivo (reflete a origem) quando nenhuma origem e configurada (dev/testes).
 */
export function buildCors(origins: readonly string[] | undefined): RequestHandler {
  if (!origins || origins.length === 0) {
    return cors({ origin: true, credentials: true });
  }

  const allowed = new Set(origins);
  return cors({
    origin: (origin, callback) => {
      if (!origin || allowed.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origem nao permitida pelo CORS'));
      }
    },
    credentials: true,
  });
}

/** Limita as tentativas nas rotas de autenticacao para conter forca bruta. */
export function authRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'TooManyRequests',
      message: 'Muitas tentativas; tente novamente mais tarde.',
    },
  });
}
