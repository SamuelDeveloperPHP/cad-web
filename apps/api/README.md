# apps/api

Backend SaaS do CAD-WEB em **Node.js + Express + TypeScript**.

Este app concentra autenticacao, multiempresa (tenants), permissoes, projetos,
desenhos, branches, commits, merge requests e auditoria. O backend trata o
documento CAD como JSON opaco versionado; nunca importa nem reimplementa o
kernel geometrico (`packages/*`).

## Stack

- Node.js 22 + Express 5
- TypeScript (ESM, `moduleResolution: NodeNext`)
- Vitest + Supertest para testes de endpoint
- PostgreSQL (banco principal) e Redis (cache, filas, realtime) — a integrar
  nos proximos MVPs

## Estrutura

```
apps/api/
  src/
    server.ts            ponto de entrada (cria o app e escuta a porta)
    app.ts               monta o Express (middlewares + rotas), sem listen
    env.ts               leitura e validacao das variaveis de ambiente
    routes/
      health.ts          GET /health
    middleware/
      notFound.ts        404 em JSON para rotas inexistentes
      errorHandler.ts    500 em JSON para erros nao tratados
    app.test.ts          testes do contrato minimo (/health e 404)
```

## Comandos

```bash
npm run dev -w @cad-web/api        # sobe em watch via tsx (padrao: porta 3333)
npm run build -w @cad-web/api      # compila para dist/
npm run start -w @cad-web/api      # roda a versao compilada (node dist/server.js)
npm run test -w @cad-web/api       # testes (Vitest + Supertest)
npm run typecheck -w @cad-web/api  # checagem de tipos
```

Variaveis de ambiente em `.env` (veja `.env.example`): `PORT`, `NODE_ENV`.

## Rota disponivel

- `GET /health` — devolve `{ status, uptime, timestamp }` para verificacao de saude.

## Proximos passos

Seguir o roadmap (fase 8): base do backend (auth, tenants), projetos e desenhos,
branches e commits, merge requests e integracao com o app web.
