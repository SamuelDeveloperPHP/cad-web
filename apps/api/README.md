# apps/api

Backend SaaS do CAD-WEB em **Node.js + Express + TypeScript**.

Este app concentra autenticacao, multiempresa (tenants), permissoes, projetos,
desenhos, branches, commits, merge requests e auditoria. O backend trata o
documento CAD como JSON opaco versionado; nunca importa nem reimplementa o
kernel geometrico (`packages/*`).

## Stack

- Node.js 22 + Express 5
- TypeScript (ESM, `moduleResolution: NodeNext`)
- Drizzle ORM sobre PostgreSQL (`pg`)
- `zod` (validacao), `jose` (JWT), `scrypt` nativo (hash de senha)
- Vitest + Supertest; os testes usam PGlite (PostgreSQL em WASM), sem banco externo

## Estrutura

```
apps/api/
  drizzle/               migrations SQL geradas pelo drizzle-kit
  drizzle.config.ts      configuracao do drizzle-kit
  src/
    server.ts            ponto de entrada (valida config, conecta e escuta)
    app.ts               monta o Express (createApp(deps)), sem listen
    env.ts               leitura/validacao das variaveis de ambiente
    db/
      schema.ts          tabelas: tenants, users
      client.ts          cria o pool pg + instancia Drizzle
      migrate.ts         aplica as migrations no PostgreSQL
      paths.ts           caminho da pasta de migrations
    middleware/
      authenticate.ts    valida o JWT e popula req.user
      notFound.ts        404 em JSON
      errorHandler.ts    500 em JSON
    modules/
      auth/              register, login, hash e JWT, schemas
      account/           rotas protegidas /me e /users
    repositories/
      users.repo.ts      consultas de tenants/users e projecoes publicas
    routes/health.ts     GET /health
    test/makeTestApp.ts  backend de teste com PGlite migrado
```

## Variaveis de ambiente

Veja `.env.example`. Para subir o servidor sao obrigatorias:

- `DATABASE_URL` — conexao com o PostgreSQL
- `JWT_SECRET` — segredo para assinar os tokens
- `PORT` (padrao `3333`), `NODE_ENV` (padrao `development`)

## Comandos

```bash
npm run dev -w @cad-web/api          # sobe em watch via tsx
npm run build -w @cad-web/api        # compila para dist/
npm run start -w @cad-web/api        # roda a versao compilada
npm run test -w @cad-web/api         # testes (Vitest + Supertest + PGlite)
npm run typecheck -w @cad-web/api    # checagem de tipos
npm run db:generate -w @cad-web/api  # gera uma nova migration a partir do schema
npm run migrate -w @cad-web/api      # aplica as migrations no DATABASE_URL
```

## Endpoints

| Metodo | Rota                   | Protegido | Descricao                                   |
| ------ | ---------------------- | --------- | ------------------------------------------- |
| GET    | `/health`              | nao       | Saude do servico                            |
| POST   | `/api/v1/auth/register`| nao       | Cria empresa + usuario admin, devolve token |
| POST   | `/api/v1/auth/login`   | nao       | Autentica e devolve token                   |
| GET    | `/api/v1/me`           | sim       | Usuario autenticado + empresa               |
| GET    | `/api/v1/users`        | sim       | Usuarios da empresa (isolado por tenant)    |

Autenticacao por `Authorization: Bearer <token>`.

## Proximos passos

Seguir a fase 8 do roadmap: papeis/permissoes (RBAC), projetos e desenhos,
branches e commits (snapshot JSON imutavel), merge requests e integracao com o
app web. Docker com PostgreSQL/Redis para desenvolvimento local.
