import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

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

/** Projetos pertencem a uma empresa e agrupam desenhos. */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('projects_tenant_idx').on(table.tenantId)],
);

/** Desenhos CAD de um projeto; o documento nativo e guardado como JSON opaco. */
export const drawings = pgTable(
  'drawings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    document: jsonb('document').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('drawings_tenant_idx').on(table.tenantId),
    index('drawings_project_idx').on(table.projectId),
  ],
);

/** Branches de um desenho: ponteiros nomeados para o commit de cabeca (head). */
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    drawingId: uuid('drawing_id')
      .notNull()
      .references(() => drawings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Aponta para o ultimo commit da branch; nulo enquanto nao houver commits.
    // AnyPgColumn quebra o ciclo de tipos entre branches e commits (FK circular).
    headCommitId: uuid('head_commit_id').references((): AnyPgColumn => commits.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('branches_drawing_name_unique').on(table.drawingId, table.name),
    index('branches_drawing_idx').on(table.drawingId),
    index('branches_tenant_idx').on(table.tenantId),
  ],
);

/** Commits: snapshot JSON imutavel do documento, com autor, mensagem e parent. */
export const commits = pgTable(
  'commits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    drawingId: uuid('drawing_id')
      .notNull()
      .references(() => drawings.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    // Commit anterior na cadeia; nulo no primeiro commit. Auto-referencia.
    parentId: uuid('parent_id').references((): AnyPgColumn => commits.id, { onDelete: 'set null' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    document: jsonb('document').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('commits_drawing_idx').on(table.drawingId),
    index('commits_branch_idx').on(table.branchId),
    index('commits_tenant_idx').on(table.tenantId),
  ],
);

/** Tipos inferidos para uso nas camadas de servico e apresentacao. */
export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Drawing = typeof drawings.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type Commit = typeof commits.$inferSelect;
