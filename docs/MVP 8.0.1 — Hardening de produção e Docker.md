# MVP 8.0.1 — Hardening de produção e Docker

Complemento da fase 8: deixa o `apps/api` pronto para rodar em produção, com
segurança, observabilidade e empacotamento em contêiner. Não adiciona regras de
negócio novas — endurece o que o MVP 8.0 entregou.

## Objetivo

- Reduzir a superfície de ataque do backend (cabeçalhos, CORS, rate limit, logs
  sem segredos, erros sem vazamento).
- Permitir subir o backend com PostgreSQL e Redis em qualquer host via Docker.
- Expor readiness para orquestradores (load balancer, Kubernetes, etc.).

## Arquivos criados

- `apps/api/src/middleware/security.ts` — `buildCors` (restrito por env ou
  permissivo em dev) e `authRateLimiter` (50 req / 15 min nas rotas de auth).
- `apps/api/Dockerfile` — imagem multi-stage (builder compila, runner enxuto,
  roda como usuário `node`).
- `docker-compose.yml` — api + PostgreSQL 16 + Redis 7; aplica migrations antes
  de subir o servidor.
- `.dockerignore` — mantém o contexto de build limpo.
- `apps/api/src/hardening.test.ts` — testa helmet, `x-powered-by` e headers de
  rate limit.

## Arquivos alterados

- `src/app.ts` — `createApp(deps)` aplica `helmet`, CORS, `pino-http` (quando há
  logger), limite de 1 MB no JSON, rate limit nas rotas de auth; `deps` ganhou
  `corsOrigins`, `rateLimit` e `logger`.
- `src/routes/health.ts` — vira fábrica `createHealthRouter(db)` com `/`
  (liveness) e `/ready` (readiness, faz `select 1`).
- `src/server.ts` — logger `pino` (redige `authorization`/`cookie`), validação de
  `JWT_SECRET` forte em produção, aviso de CORS aberto em produção, shutdown
  ordenado.
- `src/middleware/errorHandler.ts` — não vaza `err.message` ao cliente em
  produção.
- `src/modules/auth/auth.service.ts` — `jwtVerify` fixa o algoritmo `HS256`.
- `src/env.ts` — passa a ler `CORS_ORIGINS` e `LOG_LEVEL`.
- `.env.example` — documenta `CORS_ORIGINS`, `LOG_LEVEL` e `REDIS_URL`.

## Decisões técnicas

- **Middlewares injetáveis:** `logger` e `rateLimit` entram por `deps`, então os
  testes sobem o app em silêncio e sem limitar; um teste dedicado liga os dois
  para validá-los.
- **Readiness separado de liveness:** `/health` responde enquanto o processo
  vive; `/health/ready` só responde quando o banco está acessível.
- **Logs sem segredos:** o `pino` redige o cabeçalho `authorization`, então o
  token Bearer nunca cai no log.
- **Docker com contexto na raiz:** como o workspace npm vive na raiz, o build
  copia o monorepo, instala, compila o `apps/api` e remove dev deps; o runner só
  recebe `node_modules` de produção e `dist/` + `drizzle/`.

## Como testar

```bash
npm run test -w @cad-web/api   # inclui hardening.test.ts e health/ready
npx tsc -b                     # typecheck + build

# Produção local (Docker):
docker compose up --build      # migra e sobe a API em http://127.0.0.1:3333
curl http://127.0.0.1:3333/health
curl http://127.0.0.1:3333/health/ready
```

## Próximos passos

- RBAC (papéis e permissões) e convite de usuários.
- Projetos e desenhos por empresa; branches e commits.
- Pipeline de CI/CD de publicação quando o host for escolhido.
- Usar o Redis (cache/filas/rate limit distribuído) quando houver carga.
