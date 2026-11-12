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
- `helmet`, `cors`, `express-rate-limit` e `pino`/`pino-http` (seguranca e logs)
- Vitest + Supertest; os testes usam PGlite (PostgreSQL em WASM), sem banco externo

## Estrutura

```
apps/api/
  Dockerfile             imagem de producao (multi-stage)
  drizzle/               migrations SQL geradas pelo drizzle-kit
  drizzle.config.ts      configuracao do drizzle-kit
  src/
    server.ts            ponto de entrada (valida config, conecta, loga e escuta)
    app.ts               monta o Express (createApp(deps)): seguranca, rotas
    env.ts               leitura/validacao das variaveis de ambiente
    db/                  schema, client (pool pg), migrate, caminho das migrations
    middleware/
      authenticate.ts    valida o JWT e popula req.user
      security.ts        CORS e rate limit das rotas de auth
      notFound.ts        404 em JSON
      errorHandler.ts    500 em JSON (sem vazar detalhes em producao)
    modules/
      auth/              register, login, hash e JWT, schemas
      account/           rotas protegidas /me e /users
    repositories/        consultas de tenants/users e projecoes publicas
    routes/health.ts     GET /health (liveness) e GET /health/ready (readiness)
    test/makeTestApp.ts  backend de teste com PGlite migrado
```

## Variaveis de ambiente

Veja `.env.example`. Para subir o servidor sao obrigatorias `DATABASE_URL` e
`JWT_SECRET` (>= 32 caracteres em producao). Opcionais: `PORT` (3333),
`NODE_ENV` (development), `CORS_ORIGINS` (lista separada por virgula; ausente
reflete a origem — defina em producao), `LOG_LEVEL` (info).

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

| Metodo | Rota                    | Protegido | Descricao                                   |
| ------ | ----------------------- | --------- | ------------------------------------------- |
| GET    | `/health`               | nao       | Liveness (processo no ar)                   |
| GET    | `/health/ready`         | nao       | Readiness (checa o banco)                   |
| POST   | `/api/v1/auth/register` | nao       | Cria empresa + usuario admin, devolve token |
| POST   | `/api/v1/auth/login`    | nao       | Autentica e devolve token                   |
| GET    | `/api/v1/me`            | sim       | Usuario autenticado + empresa               |
| GET    | `/api/v1/users`         | sim       | Usuarios da empresa (isolado por tenant)    |
| POST   | `/api/v1/projects`                  | sim | Cria um projeto                        |
| GET    | `/api/v1/projects`                  | sim | Lista os projetos da empresa           |
| GET    | `/api/v1/projects/:id`              | sim | Detalha um projeto                     |
| PATCH  | `/api/v1/projects/:id`              | sim | Renomeia um projeto                    |
| DELETE | `/api/v1/projects/:id`              | sim | Remove um projeto (e seus desenhos)    |
| POST   | `/api/v1/projects/:id/drawings`     | sim | Cria um desenho no projeto             |
| GET    | `/api/v1/projects/:id/drawings`     | sim | Lista desenhos do projeto (sem document) |
| GET    | `/api/v1/drawings/:id`              | sim | Le um desenho (com document)           |
| PUT    | `/api/v1/drawings/:id`              | sim | Salva um desenho (document + nome)     |
| DELETE | `/api/v1/drawings/:id`              | sim | Remove um desenho                      |
| GET    | `/api/v1/drawings/:id/branches`     | sim | Lista as branches do desenho           |
| POST   | `/api/v1/drawings/:id/branches`     | sim | Cria uma branch (de um commit/head)    |
| POST   | `/api/v1/drawings/:id/commits`      | sim | Commit: snapshot do documento atual    |
| POST   | `/api/v1/drawings/:id/checkout`     | sim | Restaura o documento para um commit    |
| GET    | `/api/v1/branches/:id/commits`      | sim | Historico da branch (head -> raiz)     |
| GET    | `/api/v1/commits/:id`               | sim | Commit com o documento (snapshot)      |

Autenticacao por `Authorization: Bearer <token>`. Tudo isolado por `tenant_id`.
O corpo JSON tem limite por rota: 64 KB em auth, 256 KB em projetos e 25 MB em
desenhos (documentos CAD sao grandes).

## Seguranca (hardening)

- `helmet` (cabecalhos), `x-powered-by` desligado, CORS restrito por `CORS_ORIGINS`.
- Rate limit nas rotas `/auth` (50 por 15 min) contra forca bruta.
- JWT fixado em `HS256` na verificacao; segredo forte exigido em producao.
- Senhas com `scrypt` e comparacao em tempo constante.
- `pino` redige `authorization`/`cookie` dos logs; limite de 1 MB no corpo JSON.
- Em producao, erros 500 nao vazam detalhes internos.

## Docker

O `Dockerfile` (multi-stage) e o `docker-compose.yml` (na raiz do repo) sobem o
backend com PostgreSQL e Redis, em qualquer host:

```bash
docker compose up --build
# aplica as migrations e sobe a API em http://127.0.0.1:3333
```

O build usa a raiz do monorepo como contexto (o workspace npm vive na raiz).

## Proximos passos

Seguir a fase 8 do roadmap: papeis/permissoes (RBAC), projetos e desenhos,
branches e commits (snapshot JSON imutavel), merge requests e integracao com o
app web. Refresh tokens e verificacao de e-mail quando necessario.
