# MVP 8.0 — Backend base (tenants e autenticação)

Primeira fatia da fase 8 do roadmap: inicia o backend SaaS em **Node.js +
Express + TypeScript** com empresas (tenants), usuários, autenticação por JWT e
isolamento multiempresa. Continua de onde o esqueleto do `apps/api` parou.

## Objetivo

- Registrar uma empresa com seu usuário administrador e autenticar por e-mail e
  senha, emitindo um token de acesso (JWT).
- Expor rotas protegidas que só enxergam dados da empresa do solicitante.
- Deixar a base de banco (Drizzle + PostgreSQL) e de testes (PGlite) pronta para
  os próximos recursos (projetos, desenhos, branches, commits).

## Arquivos criados

- `src/db/schema.ts` — tabelas `tenants` e `users` (ids `uuid`, FK com cascade,
  e-mail único global, índice por `tenant_id`).
- `src/db/client.ts` — `createDb(connectionString)`: pool `pg` + Drizzle; tipo
  `AppDatabase`.
- `src/db/migrate.ts` — aplica as migrations no `DATABASE_URL`.
- `src/db/paths.ts` — caminho da pasta de migrations, resolvido via
  `import.meta.url` (funciona em `src/` e em `dist/`).
- `drizzle.config.ts` + `drizzle/0000_*.sql` — configuração e migration inicial.
- `src/modules/auth/auth.service.ts` — hash/verify de senha com `scrypt` nativo
  e assinatura/validação de JWT com `jose`.
- `src/modules/auth/auth.schemas.ts` — validação de entrada com `zod`.
- `src/modules/auth/auth.routes.ts` — `POST /register`, `POST /login`.
- `src/modules/account/account.routes.ts` — `GET /me`, `GET /users` (protegidas).
- `src/repositories/users.repo.ts` — consultas de tenants/users + projeções
  públicas (sem o hash).
- `src/middleware/authenticate.ts` — valida o `Bearer` e popula `req.user`.
- `src/types/express.d.ts` — estende `Express.Request` com `user`.
- `src/test/makeTestApp.ts` — backend de teste com PGlite migrado.
- Testes: `src/modules/auth/auth.test.ts`,
  `src/modules/account/tenantIsolation.test.ts`, `src/app.test.ts`.

## Arquivos alterados

- `src/app.ts` — `createApp(deps)` recebe `{ db, jwtSecret }` (injeção para
  testes) e monta a API em `/api/v1`.
- `src/server.ts` — valida `DATABASE_URL`/`JWT_SECRET`, conecta e encerra o pool
  no `SIGTERM`/`SIGINT`.
- `src/env.ts` — passa a ler `DATABASE_URL` e `JWT_SECRET`.
- `package.json` — scripts `db:generate` e `migrate`; dependências Drizzle, `pg`,
  `zod`, `jose` e, em dev, `drizzle-kit`, `@electric-sql/pglite`, `@types/pg`.

## Decisões técnicas

- **Drizzle + PGlite nos testes:** o mesmo schema roda contra PostgreSQL real
  (via `pg`) em dev/prod e contra PGlite (PostgreSQL em WASM) nos testes, então o
  CI valida SQL de verdade sem precisar de um serviço de banco.
- **`createApp(deps)` com injeção:** separar o app da conexão real permite testar
  toda a pilha HTTP (register → login → /me → /users) em memória.
- **Senha com `scrypt` nativo:** evita dependência nativa compilada (bcrypt/argon2)
  e mantém o backend portátil; comparação em tempo constante.
- **E-mail único global nesta fatia:** simplifica o login (sem escolher empresa).
  A evolução para o mesmo usuário em várias empresas fica para depois.
- **Isolamento multiempresa:** as consultas de domínio filtram por `tenant_id`
  derivado do token; há teste provando que a empresa A não vê usuários da B.

## Endpoints

- `POST /api/v1/auth/register` — `{ tenantName, email, password }` → `201`
  `{ token, user, tenant }`.
- `POST /api/v1/auth/login` — `{ email, password }` → `200 { token, user, tenant }`.
- `GET /api/v1/me` — protegido → `{ user, tenant }`.
- `GET /api/v1/users` — protegido → `{ users }` (apenas da empresa do token).
- `GET /health` — saúde do serviço.

## Como testar

```bash
npm run test -w @cad-web/api      # Vitest + Supertest + PGlite (sem banco externo)
npx tsc -b                        # typecheck + build de todos os pacotes
```

Manual (com um PostgreSQL real):

```bash
cp apps/api/.env.example apps/api/.env   # ajuste DATABASE_URL e JWT_SECRET
npm run migrate -w @cad-web/api
npm run dev -w @cad-web/api
# POST http://127.0.0.1:3333/api/v1/auth/register { tenantName, email, password }
```

## Próximos passos

- Papéis e permissões (RBAC) e convite de usuários para uma empresa existente.
- Projetos e desenhos por empresa (CRUD + upload/download do JSON nativo).
- Branches e commits (snapshot JSON imutável, autor, mensagem, parent, diff).
- `docker-compose` com PostgreSQL + Redis para desenvolvimento local.
- Integração do app web (login, abrir/salvar desenho remoto).
