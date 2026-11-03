import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { env } from './env.js';

// Ponto de entrada do processo: valida a configuracao, conecta ao banco e sobe.
const { databaseUrl, jwtSecret } = env;
if (!databaseUrl) {
  throw new Error('DATABASE_URL nao configurada');
}
if (!jwtSecret) {
  throw new Error('JWT_SECRET nao configurada');
}

const { db, pool } = createDb(databaseUrl);
const app = createApp({ db, jwtSecret });

const server = app.listen(env.port, () => {
  // Anuncia em qual endereco o backend ficou disponivel.
  console.log(
    `[api] CAD-WEB backend no ar em http://127.0.0.1:${env.port} (${env.nodeEnv})`,
  );
});

// Encerra o servidor e o pool de conexoes de forma ordenada ao receber sinal.
function shutdown(): void {
  server.close(() => {
    void pool.end();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
