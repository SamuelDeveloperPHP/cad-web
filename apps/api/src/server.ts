import pino from 'pino';
import { createApp, type AppDeps } from './app.js';
import { createDb } from './db/client.js';
import { env } from './env.js';

// Redige cabecalhos sensiveis (token e cookie) para nao vazarem nos logs.
const logger = pino({
  level: env.logLevel,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

// Valida a configuracao obrigatoria antes de subir, falhando cedo se faltar.
const { databaseUrl, jwtSecret } = env;
if (!databaseUrl) {
  throw new Error('DATABASE_URL nao configurada');
}
if (!jwtSecret) {
  throw new Error('JWT_SECRET nao configurada');
}
// Em producao, exige um segredo forte o suficiente para assinar os tokens.
if (env.nodeEnv === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET muito curto para producao (use ao menos 32 caracteres)');
}

const { db, pool } = createDb(databaseUrl);

const deps: AppDeps = { db, jwtSecret, rateLimit: true, logger };
if (env.corsOrigins) {
  deps.corsOrigins = env.corsOrigins;
} else if (env.nodeEnv === 'production') {
  // Sem origens explicitas, o CORS reflete qualquer origem: perigoso em producao.
  logger.warn('CORS_ORIGINS nao definido em producao: o CORS refletira qualquer origem.');
}

const app = createApp(deps);

const server = app.listen(env.port, () => {
  logger.info(`CAD-WEB backend no ar na porta ${env.port} (${env.nodeEnv})`);
});

// Encerra o servidor e o pool de conexoes de forma ordenada ao receber sinal.
function shutdown(): void {
  logger.info('encerrando o backend...');
  server.close(() => {
    void pool.end();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
