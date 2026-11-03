import express from 'express';
import type { Express } from 'express';
import { healthRouter } from './routes/health.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { accountRoutes } from './modules/account/account.routes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import type { AppDatabase } from './db/client.js';

/** Dependencias injetadas na aplicacao; facilita trocar o banco nos testes. */
export interface AppDeps {
  db: AppDatabase;
  jwtSecret: string;
}

/**
 * Monta a aplicacao Express com os middlewares e as rotas, sem iniciar o
 * listen. Separar a criacao do app da escuta da porta permite testa-lo em
 * memoria, sem abrir uma conexao de rede.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  // Interpreta corpos JSON das requisicoes recebidas.
  app.use(express.json());

  // Verificacao de saude, sem versionamento.
  app.use('/health', healthRouter);

  // API versionada do SaaS.
  const v1 = express.Router();
  v1.use('/auth', authRoutes(deps));
  v1.use('/', accountRoutes(deps));
  app.use('/api/v1', v1);

  // Captura rotas inexistentes e erros; registrados sempre por ultimo.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
