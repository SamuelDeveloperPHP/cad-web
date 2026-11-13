// Centraliza a leitura das variaveis de ambiente do backend e aplica
// valores padrao seguros para o desenvolvimento local.

/** Descreve as configuracoes derivadas do ambiente de execucao. */
export interface AppEnv {
  /** Porta HTTP em que o servidor escuta. */
  readonly port: number;
  /** Ambiente de execucao (development, test, production). */
  readonly nodeEnv: string;
  /** String de conexao com o PostgreSQL (obrigatoria para subir o servidor). */
  readonly databaseUrl: string | undefined;
  /** Segredo usado para assinar os tokens JWT (obrigatorio para subir). */
  readonly jwtSecret: string | undefined;
  /** Origens permitidas no CORS; ausente reflete a origem da requisicao. */
  readonly corsOrigins: readonly string[] | undefined;
  /** Nivel de log do pino (trace, debug, info, warn, error, fatal). */
  readonly logLevel: string;
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

  // Aceita uma lista de origens separadas por virgula.
  const corsRaw = process.env.CORS_ORIGINS;
  const corsOrigins = corsRaw
    ? corsRaw.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0)
    : undefined;

  const logLevel = process.env.LOG_LEVEL ?? 'info';

  return {
    port,
    nodeEnv,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    corsOrigins,
    logLevel,
  };
}

/** Expoe uma instancia unica das configuracoes para uso em todo o backend. */
export const env: AppEnv = loadEnv();
