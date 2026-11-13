import { z } from 'zod';

/** Valida o corpo do registro: empresa + usuario administrador. */
export const registerSchema = z.object({
  tenantName: z.string().min(1).max(120),
  email: z.email(),
  password: z.string().min(8).max(200),
});

/** Valida o corpo do login. */
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
