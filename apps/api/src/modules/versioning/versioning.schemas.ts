import { z } from 'zod';

/** Valida a criacao de um commit (snapshot do documento atual da branch). */
export const createCommitSchema = z.object({
  branchId: z.uuid(),
  message: z.string().min(1).max(500),
});

/** Valida a criacao de uma branch (a partir de um commit ou do head da main). */
export const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
  fromCommitId: z.uuid().optional(),
});

/** Valida o checkout: restaura o documento de trabalho para um commit. */
export const checkoutSchema = z.object({
  commitId: z.uuid(),
});
