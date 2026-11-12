import { and, desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import {
  mergeRequestReviews,
  mergeRequests,
  users,
  type MergeRequest,
  type MergeRequestReview,
} from '../db/schema.js';

/** Metadados de um merge request, com o e-mail do autor. */
export interface MergeRequestMeta {
  id: string;
  drawingId: string;
  sourceBranchId: string;
  targetBranchId: string;
  title: string;
  status: string;
  authorId: string | null;
  authorEmail: string | null;
  mergeCommitId: string | null;
  createdAt: Date;
}

/** Dados de entrada para abrir um merge request. */
export interface CreateMergeRequestInput {
  drawingId: string;
  sourceBranchId: string;
  targetBranchId: string;
  title: string;
  description: string | null;
  authorId: string;
}

export async function createMergeRequest(
  db: AppDatabase,
  tenantId: string,
  input: CreateMergeRequestInput,
): Promise<MergeRequest> {
  const [row] = await db
    .insert(mergeRequests)
    .values({
      tenantId,
      drawingId: input.drawingId,
      sourceBranchId: input.sourceBranchId,
      targetBranchId: input.targetBranchId,
      title: input.title,
      description: input.description,
      authorId: input.authorId,
    })
    .returning();
  if (!row) {
    throw new Error('Falha ao criar o merge request');
  }
  return row;
}

export async function listMergeRequests(
  db: AppDatabase,
  tenantId: string,
  drawingId: string,
): Promise<MergeRequestMeta[]> {
  return db
    .select({
      id: mergeRequests.id,
      drawingId: mergeRequests.drawingId,
      sourceBranchId: mergeRequests.sourceBranchId,
      targetBranchId: mergeRequests.targetBranchId,
      title: mergeRequests.title,
      status: mergeRequests.status,
      authorId: mergeRequests.authorId,
      authorEmail: users.email,
      mergeCommitId: mergeRequests.mergeCommitId,
      createdAt: mergeRequests.createdAt,
    })
    .from(mergeRequests)
    .leftJoin(users, eq(users.id, mergeRequests.authorId))
    .where(and(eq(mergeRequests.tenantId, tenantId), eq(mergeRequests.drawingId, drawingId)))
    .orderBy(desc(mergeRequests.createdAt));
}

export async function findMergeRequest(
  db: AppDatabase,
  tenantId: string,
  id: string,
): Promise<MergeRequest | undefined> {
  const rows = await db
    .select()
    .from(mergeRequests)
    .where(and(eq(mergeRequests.id, id), eq(mergeRequests.tenantId, tenantId)))
    .limit(1);
  return rows[0];
}

/** Campos alteraveis de um merge request. */
export interface UpdateMergeRequestPatch {
  status?: string;
  mergeCommitId?: string;
}

export async function updateMergeRequest(
  db: AppDatabase,
  tenantId: string,
  id: string,
  patch: UpdateMergeRequestPatch,
): Promise<MergeRequest | undefined> {
  const [row] = await db
    .update(mergeRequests)
    .set(patch)
    .where(and(eq(mergeRequests.id, id), eq(mergeRequests.tenantId, tenantId)))
    .returning();
  return row;
}

/** Metadados de uma revisao, com o e-mail do revisor. */
export interface ReviewMeta {
  id: string;
  decision: string;
  comment: string | null;
  reviewerId: string | null;
  reviewerEmail: string | null;
  createdAt: Date;
}

export async function addReview(
  db: AppDatabase,
  tenantId: string,
  input: { mergeRequestId: string; reviewerId: string; decision: string; comment: string | null },
): Promise<MergeRequestReview> {
  const [row] = await db
    .insert(mergeRequestReviews)
    .values({
      tenantId,
      mergeRequestId: input.mergeRequestId,
      reviewerId: input.reviewerId,
      decision: input.decision,
      comment: input.comment,
    })
    .returning();
  if (!row) {
    throw new Error('Falha ao registrar a revisao');
  }
  return row;
}

export async function listReviews(
  db: AppDatabase,
  tenantId: string,
  mergeRequestId: string,
): Promise<ReviewMeta[]> {
  return db
    .select({
      id: mergeRequestReviews.id,
      decision: mergeRequestReviews.decision,
      comment: mergeRequestReviews.comment,
      reviewerId: mergeRequestReviews.reviewerId,
      reviewerEmail: users.email,
      createdAt: mergeRequestReviews.createdAt,
    })
    .from(mergeRequestReviews)
    .leftJoin(users, eq(users.id, mergeRequestReviews.reviewerId))
    .where(
      and(
        eq(mergeRequestReviews.tenantId, tenantId),
        eq(mergeRequestReviews.mergeRequestId, mergeRequestId),
      ),
    )
    .orderBy(desc(mergeRequestReviews.createdAt));
}
