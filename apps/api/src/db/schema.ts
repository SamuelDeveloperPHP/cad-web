import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** Empresas (tenants) do SaaS: a unidade de isolamento multiempresa. */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Usuarios, sempre vinculados a uma empresa pelo tenant_id. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('admin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // E-mail unico globalmente simplifica o login nesta primeira fatia.
    uniqueIndex('users_email_unique').on(table.email),
    // Acelera as consultas filtradas por empresa.
    index('users_tenant_idx').on(table.tenantId),
  ],
);

/** Tipos inferidos para uso nas camadas de servico e apresentacao. */
export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
