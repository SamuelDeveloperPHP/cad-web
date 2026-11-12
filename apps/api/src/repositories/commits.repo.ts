import { and, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { commits, users, type Commit } from '../db/schema.js';

/** Metadados de um commit (sem o documento), com o e-mail do autor. */
export interface CommitMeta {
  id: string;
  parentId: string | null;
  branchId: string;
  message: string;
  authorId: string | null;
  authorEmail: string | null;
  createdAt: Date;
}

/** Dados de entrada para criar um commit. */
export interface CreateCommitInput {
  drawingId: string;
  branchId: string;
  parentId: string | null;
  authorId: string;
  message: string;
  document: Record<string, unknown>;
}

/** Cria um commit (snapshot imutavel do documento). */
export async function createCommit(
  db: AppDatabase,
  tenantId: string,
  input: CreateCommitInput,
): Promise<Commit> {
  const [row] = await db
    .insert(commits)
    .values({
      tenantId,
      drawingId: input.drawingId,
      branchId: input.branchId,
      parentId: input.parentId,
      authorId: input.authorId,
      message: input.message,
      document: input.document,
    })
    .returning();
  if (!row) {
    throw new Error('Falha ao criar o commit');
  }
  return row;
}

/** Busca um commit completo (com documento) da empresa. */
export async function findCommit(
  db: AppDatabase,
  tenantId: string,
  id: string,
): Promise<Commit | undefined> {
  const rows = await db
    .select()
    .from(commits)
    .where(and(eq(commits.id, id), eq(commits.tenantId, tenantId)))
    .limit(1);
  return rows[0];
}

/** Metadados de todos os commits de um desenho (para montar o historico). */
export async function listDrawingCommitMetas(
  db: AppDatabase,
  tenantId: string,
  drawingId: string,
): Promise<CommitMeta[]> {
  return db
    .select({
      id: commits.id,
      parentId: commits.parentId,
      branchId: commits.branchId,
      message: commits.message,
      authorId: commits.authorId,
      authorEmail: users.email,
      createdAt: commits.createdAt,
    })
    .from(commits)
    .leftJoin(users, eq(users.id, commits.authorId))
    .where(and(eq(commits.tenantId, tenantId), eq(commits.drawingId, drawingId)));
}

/**
 * Historico de uma branch: caminha pelo `parentId` a partir do head, do commit
 * mais novo ate a raiz. O conjunto `seen` protege contra ciclos acidentais.
 */
export function branchHistory(all: CommitMeta[], headCommitId: string | null): CommitMeta[] {
  if (headCommitId === null) {
    return [];
  }
  const byId = new Map(all.map((commit) => [commit.id, commit]));
  const chain: CommitMeta[] = [];
  const seen = new Set<string>();
  let current = byId.get(headCommitId);
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parentId !== null ? byId.get(current.parentId) : undefined;
  }
  return chain;
}
