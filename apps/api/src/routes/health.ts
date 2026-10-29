import express from 'express';

/** Agrupa as rotas de verificacao de saude do servico. */
export const healthRouter = express.Router();

// Informa se o processo esta no ar, com o tempo de atividade e o horario atual.
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
