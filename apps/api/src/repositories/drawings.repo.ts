import { and, desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { drawings, type Drawing } from '../db/schema.js';

/** Metadados de um desenho (sem o documento, para listagens leves). */
export interface DrawingMeta {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Dados de entrada para criar um desenho. */
export interface CreateDrawingInput {
  projectId: string;
  name: string;
  document: Record<string, unknown>;
}

/** Cria um desenho na empresa/projeto informados. */
export async function createDrawing(
  db: AppDatabase,
  tenantId: string,
  input: CreateDrawingInput,
): Promise<Drawing> {
  const [row] = await db
    .insert(drawings)
    .values({
      tenantId,
      projectId: input.projectId,
      name: input.name,
      document: input.document,
    })
    .returning();
  if (!row) {
    throw new Error('Falha ao criar o desenho');
  }
  return row;
}

/** Lista os desenhos de um projeto, so com metadados (sem o documento). */
export async function listDrawingsMeta(
  db: AppDatabase,
  tenantId: string,
  projectId: string,
): Promise<DrawingMeta[]> {
  return db
    .select({
      id: drawings.id,
      projectId: drawings.projectId,
      name: drawings.name,
      createdAt: drawings.createdAt,
      updatedAt: drawings.updatedAt,
    })
    .from(drawings)
    .where(and(eq(drawings.tenantId, tenantId), eq(drawings.projectId, projectId)))
    .orderBy(desc(drawings.updatedAt));
}

/** Busca um desenho completo (com documento) da empresa, isolado por tenant. */
export async function findDrawing(
  db: AppDatabase,
  tenantId: string,
  id: string,
): Promise<Drawing | undefined> {
  const rows = await db
    .select()
    .from(drawings)
    .where(and(eq(drawings.id, id), eq(drawings.tenantId, tenantId)))
    .limit(1);
  return rows[0];
}

/** Campos alteraveis de um desenho num PUT. */
export interface UpdateDrawingPatch {
  name?: string;
  document?: Record<string, unknown>;
}

/** Atualiza nome e/ou documento de um desenho; undefined se nao existir. */
export async function updateDrawing(
  db: AppDatabase,
  tenantId: string,
  id: string,
  patch: UpdateDrawingPatch,
): Promise<Drawing | undefined> {
  const [row] = await db
    .update(drawings)
    .set(patch)
    .where(and(eq(drawings.id, id), eq(drawings.tenantId, tenantId)))
    .returning();
  return row;
}

/** Remove um desenho da empresa; devolve se algo foi removido. */
export async function deleteDrawing(
  db: AppDatabase,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(drawings)
    .where(and(eq(drawings.id, id), eq(drawings.tenantId, tenantId)))
    .returning({ id: drawings.id });
  return rows.length > 0;
}
