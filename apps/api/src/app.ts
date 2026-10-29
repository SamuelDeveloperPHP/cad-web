import express from 'express';
import type { Express } from 'express';
import { healthRouter } from './routes/health.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

/**
 * Monta a aplicacao Express com os middlewares e as rotas, sem iniciar o
 * listen. Separar a criacao do app da escuta da porta permite testa-lo em
 * memoria, sem abrir uma conexao de rede.
 */
export function createApp(): Express {
  const app = express();

  // Interpreta corpos JSON das requisicoes recebidas.
  app.use(express.json());

  // Rotas de dominio do backend.
  app.use('/health', healthRouter);

  // Captura rotas inexistentes e erros; registrados sempre por ultimo.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
