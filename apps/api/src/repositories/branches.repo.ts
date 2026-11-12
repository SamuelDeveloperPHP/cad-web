import { and, asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { branches, type Branch } from '../db/schema.js';

/** Lista as branches de um desenho (mais antigas primeiro). */
export async function listBranches(
  db: AppDatabase,
  tenantId: string,
  drawingId: string,
): Promise<Branch[]> {
  return db
    .select()
    .from(branches)
    .where(and(eq(branches.tenantId, tenantId), eq(branches.drawingId, drawingId)))
    .orderBy(asc(branches.createdAt));
}

/** Busca uma branch pelo id (isolada por tenant). */
export async function findBranch(
  db: AppDatabase,
  tenantId: string,
  id: string,
): Promise<Branch | undefined> {
  const rows = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
    .limit(1);
  return rows[0];
}

/** Busca uma branch pelo nome dentro de um desenho. */
export async function findBranchByName(
  db: AppDatabase,
  tenantId: string,
  drawingId: string,
  name: string,
): Promise<Branch | undefined> {
  const rows = await db
    .select()
    .from(branches)
    .where(
      and(
        eq(branches.tenantId, tenantId),
        eq(branches.drawingId, drawingId),
        eq(branches.name, name),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Cria uma branch apontando para um commit de cabeca (ou nenhum). */
export async function createBranch(
  db: AppDatabase,
  tenantId: string,
  input: { drawingId: string; name: string; headCommitId: string | null },
): Promise<Branch> {
  const [row] = await db
    .insert(branches)
    .values({
      tenantId,
      drawingId: input.drawingId,
      name: input.name,
      headCommitId: input.headCommitId,
    })
    .returning();
  if (!row) {
    throw new Error('Falha ao criar a branch');
  }
  return row;
}

/** Atualiza o commit de cabeca de uma branch. */
export async function setBranchHead(
  db: AppDatabase,
  tenantId: string,
  branchId: string,
  headCommitId: string,
): Promise<void> {
  await db
    .update(branches)
    .set({ headCommitId })
    .where(and(eq(branches.id, branchId), eq(branches.tenantId, tenantId)));
}

/** Garante a branch `main` do desenho (para desenhos criados antes do versionamento). */
export async function ensureMainBranch(
  db: AppDatabase,
  tenantId: string,
  drawingId: string,
): Promise<Branch> {
  const existing = await findBranchByName(db, tenantId, drawingId, 'main');
  if (existing) {
    return existing;
  }
  return createBranch(db, tenantId, { drawingId, name: 'main', headCommitId: null });
}
