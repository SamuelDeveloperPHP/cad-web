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

/** Valida a abertura de um merge request (origem -> destino). */
export const createMergeRequestSchema = z.object({
  sourceBranchId: z.uuid(),
  targetBranchId: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

/** Valida uma revisao de merge request. */
export const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).optional(),
});

/** Valida o merge: o cliente envia o documento ja mesclado (merge 3-vias). */
export const mergeSchema = z.object({
  document: z.record(z.string(), z.unknown()),
});
