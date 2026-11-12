# MVP 8.1 — Projetos e desenhos

Continuação da fase 8: o backend passa a **persistir projetos e desenhos** por
empresa, com o documento CAD guardado como JSON opaco versionável. É o que falta
para o app web salvar/abrir desenhos no servidor (hoje só salva local).

## Objetivo

- Guardar projetos e, dentro deles, desenhos (o documento nativo do CAD).
- CRUD completo, protegido por JWT e isolado por `tenant_id`.
- Preparar o terreno para branches/commits e para a integração do app web.

## Arquivos criados

- `src/db/schema.ts` — tabelas `projects` e `drawings` (document em `jsonb`,
  `tenant_id` em ambas, FK para empresa/projeto com `cascade`, índices e
  `updated_at` automático via `$onUpdate`).
- `src/repositories/projects.repo.ts` e `drawings.repo.ts` — consultas sempre
  filtradas por `tenant_id`; listagem de desenhos sem o documento (leve).
- `src/modules/projects/{projects.routes,projects.schemas}.ts` — projetos e os
  desenhos de um projeto.
- `src/modules/drawings/{drawings.routes,drawings.schemas}.ts` — desenho por id.
- `src/test/helpers.ts` — helpers de teste (registro e criação de projeto).
- Migration `drizzle/0001_cuddly_brood.sql`.
- Testes: `projects.test.ts` e `drawings.test.ts` (CRUD + isolamento + 404/422).

## Arquivos alterados

- `src/app.ts` — router protegido único: `authenticate` aplicado uma vez, depois
  `account`, `projects` e `drawings`; o corpo JSON passa a ser interpretado por
  router, com limites próprios (auth 64 KB, projetos 256 KB, desenhos 25 MB).
- `src/modules/auth/auth.routes.ts` — ganha o próprio parser JSON (64 KB).
- `src/modules/account/account.routes.ts` — deixa de autenticar internamente
  (o router pai já autentica).

## Endpoints (todos protegidos, isolados por tenant)

- `POST /api/v1/projects` · `GET /api/v1/projects` · `GET/PATCH/DELETE /api/v1/projects/:id`
- `POST/GET /api/v1/projects/:id/drawings`
- `GET/PUT/DELETE /api/v1/drawings/:id`

## Decisões técnicas

- **Documento como JSON opaco (`jsonb`):** o backend não reimplementa o kernel;
  valida só que é um objeto. Round-trip exato do documento nativo.
- **Isolamento por `tenant_id` em toda query:** `get`/`update`/`delete` filtram
  por id **e** tenant, então acesso cruzado vira 404 (comprovado em teste).
- **Limite de corpo por rota:** desenhos CAD podem ter dezenas de milhares de
  entidades, daí 25 MB nas rotas de desenho e limites pequenos no resto.
- **Listagem leve:** a lista de desenhos não traz o documento, só metadados.

## Como testar

```bash
npm run test -w @cad-web/api   # inclui projects.test.ts e drawings.test.ts
npx tsc -b
```

## Próximos passos

- Integração do app web: cliente de API, login/registro e salvar/abrir o desenho
  atual no servidor.
- Branches e commits (snapshot imutável do documento, autor, mensagem, parent).
- Paginação nas listagens quando houver volume.
