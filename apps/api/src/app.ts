import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { createHealthRouter } from './routes/health.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { accountRoutes } from './modules/account/account.routes.js';
import { projectRoutes } from './modules/projects/projects.routes.js';
import { drawingRoutes } from './modules/drawings/drawings.routes.js';
import { drawingVersionRoutes } from './modules/versioning/drawingVersion.routes.js';
import { branchRoutes } from './modules/versioning/branches.routes.js';
import { commitRoutes } from './modules/versioning/commits.routes.js';
import { authenticate } from './middleware/authenticate.js';
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
 * memoria, sem abrir uma conexao de rede. O corpo JSON e interpretado por
 * router, com limites proprios (desenhos CAD aceitam ate 25 MB).
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

  // Saude (liveness/readiness), sem versionamento.
  app.use('/health', createHealthRouter(deps.db));

  const v1 = express.Router();

  // Rotas publicas de autenticacao (com rate limit).
  if (deps.rateLimit ?? true) {
    v1.use('/auth', authRateLimiter(), authRoutes(deps));
  } else {
    v1.use('/auth', authRoutes(deps));
  }

  // Rotas protegidas: exigem um token valido (autenticacao aplicada uma vez).
  const secure = express.Router();
  secure.use(authenticate(deps.jwtSecret));
  secure.use('/', accountRoutes(deps));
  secure.use('/projects', projectRoutes(deps));
  secure.use('/drawings', drawingRoutes(deps));
  secure.use('/drawings', drawingVersionRoutes(deps));
  secure.use('/branches', branchRoutes(deps));
  secure.use('/commits', commitRoutes(deps));
  v1.use(secure);

  app.use('/api/v1', v1);

  // Sempre por ultimo: rota inexistente e tratamento de erros.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
