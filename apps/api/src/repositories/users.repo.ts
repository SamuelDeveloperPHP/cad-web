import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { tenants, users, type Tenant, type User } from '../db/schema.js';

/** Dados de entrada para criar a empresa e seu usuario administrador. */
export interface CreateTenantInput {
  tenantName: string;
  email: string;
  passwordHash: string;
}

/** Cria a empresa e o usuario admin em uma unica transacao. */
export async function createTenantWithAdmin(
  db: AppDatabase,
  input: CreateTenantInput,
): Promise<{ tenant: Tenant; user: User }> {
  return db.transaction(async (tx) => {
    const [tenant] = await tx.insert(tenants).values({ name: input.tenantName }).returning();
    if (!tenant) {
      throw new Error('Falha ao criar a empresa');
    }

    const [user] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: input.email,
        passwordHash: input.passwordHash,
        role: 'admin',
      })
      .returning();
    if (!user) {
      throw new Error('Falha ao criar o usuario');
    }

    return { tenant, user };
  });
}

/** Busca um usuario pelo e-mail (unico globalmente nesta fatia). */
export async function findUserByEmail(db: AppDatabase, email: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

/** Busca um usuario pelo id. */
export async function findUserById(db: AppDatabase, id: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

/** Busca uma empresa pelo id. */
export async function findTenantById(db: AppDatabase, id: string): Promise<Tenant | undefined> {
  const rows = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return rows[0];
}

/** Lista os usuarios de uma empresa (isolado por tenant_id). */
export async function listUsersInTenant(db: AppDatabase, tenantId: string): Promise<User[]> {
  return db.select().from(users).where(eq(users.tenantId, tenantId));
}

/** Projecao publica de um usuario, sem expor o hash da senha. */
export function publicUser(user: User): {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  createdAt: Date;
} {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    createdAt: user.createdAt,
  };
}

/** Projecao publica de uma empresa. */
export function publicTenant(tenant: Tenant): { id: string; name: string; createdAt: Date } {
  return { id: tenant.id, name: tenant.name, createdAt: tenant.createdAt };
}
