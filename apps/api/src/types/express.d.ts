// Estende o Request do Express com a identidade autenticada pelo middleware.
// Declaracao ambiente que se funde ao namespace global Express de @types/express.
declare namespace Express {
  interface Request {
    user?: {
      id: string;
      tenantId: string;
      role: string;
    };
  }
}
