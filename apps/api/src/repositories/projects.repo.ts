import { and, desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { projects, type Project } from '../db/schema.js';

/** Cria um projeto na empresa informada. */
export async function createProject(
  db: AppDatabase,
  tenantId: string,
  name: string,
): Promise<Project> {
  const [row] = await db.insert(projects).values({ tenantId, name }).returning();
  if (!row) {
    throw new Error('Falha ao criar o projeto');
  }
  return row;
}

/** Lista os projetos da empresa, dos mais recentes aos mais antigos. */
export async function listProjects(db: AppDatabase, tenantId: string): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.tenantId, tenantId))
    .orderBy(desc(projects.updatedAt));
}

/** Busca um projeto da empresa pelo id (isolado por tenant). */
export async function findProject(
  db: AppDatabase,
  tenantId: string,
  id: string,
): Promise<Project | undefined> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);
  return rows[0];
}

/** Renomeia um projeto da empresa; devolve undefined se nao existir. */
export async function updateProject(
  db: AppDatabase,
  tenantId: string,
  id: string,
  name: string,
): Promise<Project | undefined> {
  const [row] = await db
    .update(projects)
    .set({ name })
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    .returning();
  return row;
}

/** Remove um projeto da empresa; devolve se algo foi removido. */
export async function deleteProject(
  db: AppDatabase,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    .returning({ id: projects.id });
  return rows.length > 0;
}
