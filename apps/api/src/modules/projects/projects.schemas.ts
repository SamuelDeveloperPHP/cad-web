import { z } from 'zod';

/** Valida o corpo de criacao de um projeto. */
export const createProjectSchema = z.object({
  name: z.string().min(1).max(160),
});

/** Valida o corpo de renomeacao de um projeto. */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(160),
});
