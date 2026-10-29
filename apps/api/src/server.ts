import { createApp } from './app.js';
import { env } from './env.js';

// Ponto de entrada do processo: cria a aplicacao e passa a escutar a porta.
const app = createApp();

app.listen(env.port, () => {
  // Anuncia em qual endereco o backend ficou disponivel.
  console.log(
    `[api] CAD-WEB backend no ar em http://127.0.0.1:${env.port} (${env.nodeEnv})`,
  );
});
