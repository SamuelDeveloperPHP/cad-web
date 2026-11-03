import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { createHealthRouter } from './routes/health.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { accountRoutes } from './modules/account/account.routes.js';
import { authRateLimiter, buildCors } from './middleware/security.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import type { AppDatabase } from './db/client.js';

/** Dependencias injetadas na aplicacao; facilita trocar o banco nos testes. */
export interface AppDeps {
  db: AppDatabase;
  jwtSecret: string;
  /** Origens permitidas no CORS; ausente reflete a origem (dev/testes). */
  corsOrigins?: readonly string[];
  /** Habilita o rate limit nas rotas de auth (padrao: true). */
  rateLimit?: boolean;
  /** Logger pino para o log de requisicoes; ausente desliga o log (testes). */
  logger?: Logger;
}

/**
 * Monta a aplicacao Express com middlewares, seguranca e rotas, sem iniciar o
 * listen. Separar a criacao do app da escuta da porta permite testa-lo em
 * memoria, sem abrir uma conexao de rede.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  // Nao revela a tecnologia do servidor.
  app.disable('x-powered-by');

  // Log estruturado de requisicoes quando um logger e fornecido.
  if (deps.logger) {
    app.use(pinoHttp({ logger: deps.logger }));
  }

  // Cabecalhos de seguranca e politica de CORS.
  app.use(helmet());
  app.use(buildCors(deps.corsOrigins));

  // Interpreta JSON com limite de tamanho, para conter payloads abusivos.
  app.use(express.json({ limit: '1mb' }));

  // Saude (liveness/readiness), sem versionamento.
  app.use('/health', createHealthRouter(deps.db));

  // API versionada do SaaS.
  const v1 = express.Router();
  if (deps.rateLimit ?? true) {
    v1.use('/auth', authRateLimiter(), authRoutes(deps));
  } else {
    v1.use('/auth', authRoutes(deps));
  }
  v1.use('/', accountRoutes(deps));
  app.use('/api/v1', v1);

  // Sempre por ultimo: rota inexistente e tratamento de erros.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
