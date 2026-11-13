import { z } from 'zod';

// O documento CAD e tratado como objeto JSON opaco (validacao estrutural minima).
const documentSchema = z.record(z.string(), z.unknown());

/** Valida a criacao de um desenho (documento opcional, padrao vazio). */
export const createDrawingSchema = z.object({
  name: z.string().min(1).max(160),
  document: documentSchema.optional(),
});

/** Valida o salvamento de um desenho (documento obrigatorio, nome opcional). */
export const updateDrawingSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  document: documentSchema,
});
