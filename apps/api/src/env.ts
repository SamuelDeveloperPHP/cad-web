// Centraliza a leitura das variaveis de ambiente do backend e aplica
// valores padrao seguros para o desenvolvimento local.

/** Descreve as configuracoes derivadas do ambiente de execucao. */
export interface AppEnv {
  /** Porta HTTP em que o servidor escuta. */
  readonly port: number;
  /** Ambiente de execucao (development, test, production). */
  readonly nodeEnv: string;
}

/** Le e valida as variaveis de ambiente, usando padroes de desenvolvimento. */
export function loadEnv(): AppEnv {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const rawPort = process.env.PORT ?? '3333';
  const port = Number.parseInt(rawPort, 10);

  // Garante que a porta configurada e um numero valido antes de subir o app.
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`PORT invalida: "${rawPort}"`);
  }

  return { port, nodeEnv };
}

/** Expoe uma instancia unica das configuracoes para uso em todo o backend. */
export const env: AppEnv = loadEnv();
