# MVP 8.3 — Branches e commits

O coração do versionamento tipo Git do roadmap: cada desenho ganha **branches** e
**commits** — snapshots JSON imutáveis do documento, com autor, mensagem e parent.
Backend + diff no kernel; a UI de histórico vem no MVP seguinte.

## Objetivo

- Guardar versões imutáveis de um desenho (commit = snapshot do documento).
- Organizar versões em branches (ponteiros nomeados para o commit de cabeça).
- Navegar o histórico (parent encadeado), restaurar uma versão (checkout) e
  comparar duas versões (diff de entidades).

## Arquivos criados

- `packages/cad-core/src/diff.ts` — `diffDocuments(prev, next)`: compara os
  documentos por entidade (id) → adicionadas, removidas e modificadas. Função
  pura, com comparação estável (independe da ordem das propriedades). Exportada
  no `index.ts`. Testes em `diff.test.ts`.
- `apps/api/src/repositories/branches.repo.ts` e `commits.repo.ts` — consultas
  isoladas por `tenant_id`; `ensureMainBranch`; `branchHistory` caminha o
  `parentId` do head até a raiz.
- `apps/api/src/modules/versioning/` — `drawingVersion.routes.ts` (branches,
  commits e checkout de um desenho), `branches.routes.ts` (histórico),
  `commits.routes.ts` (commit com documento), `versioning.schemas.ts`.
- Migration `apps/api/drizzle/0002_left_celestials.sql`.
- Testes `apps/api/src/modules/versioning/versioning.test.ts`.

## Arquivos alterados

- `apps/api/src/db/schema.ts` — tabelas `branches` (head aponta para commit) e
  `commits` (snapshot `jsonb`, `author_id`, `message`, `parent_id` auto-ref);
  FK circular branch↔commit resolvida com `AnyPgColumn`.
- `apps/api/src/repositories/drawings.repo.ts` — `createDrawing` cria a branch
  `main` na mesma transação.
- `apps/api/src/app.ts` — monta os routers de versionamento sob o router
  protegido.

## Endpoints (todos protegidos, isolados por tenant)

- `GET /api/v1/drawings/:id/branches` · `POST /api/v1/drawings/:id/branches`
  (`{ name, fromCommitId? }`)
- `POST /api/v1/drawings/:id/commits` (`{ branchId, message }`) — snapshot do
  documento de trabalho atual
- `POST /api/v1/drawings/:id/checkout` (`{ commitId }`) — restaura o documento
- `GET /api/v1/branches/:id/commits` — histórico (do head à raiz)
- `GET /api/v1/commits/:id` — commit com o documento

## Decisões técnicas

- **Snapshot completo e imutável por commit:** simples e correto; o diff
  (opcional) é computado sob demanda a partir de dois snapshots.
- **Diff no kernel (`cad-core`), não no backend:** respeita a fronteira — o
  backend trata o documento como JSON opaco; o `diffDocuments` é puro e serve
  tanto a UI quanto outros usos.
- **Histórico por `parent`:** `branchHistory` segue a cadeia de parents a partir
  do head, então uma branch criada de um commit herda a ancestralidade (como no
  `git log`), com proteção contra ciclos.
- **`main` nasce com o desenho** e é garantida de forma preguiçosa para desenhos
  antigos (`ensureMainBranch`).

## Como testar

```bash
npm run test -w @cad-web/api              # versioning.test.ts
npx vitest run --root packages/cad-core   # diff.test.ts
npx tsc -b
```

## Próximos passos

- UI de histórico no app web: commitar, listar, abrir um commit, criar branch e
  ver o diff (usando `diffDocuments`).
- Merge requests e aprovação (MVP 8.4 / fase 8.3 do roadmap).
- Diffs maiores: paginação do histórico e resumo de alterações por camada.
