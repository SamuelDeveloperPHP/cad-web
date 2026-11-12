# MVP 8.4 — Merge requests

Fecha o fluxo tipo Git do roadmap: propor, revisar e **mesclar** uma branch na
outra, com merge 3-vias no kernel e auditoria no backend. A UI vem no complemento.

## Objetivo

- Abrir um merge request de uma branch de origem para uma de destino.
- Revisar (aprovar/rejeitar) com auditoria.
- Mesclar: merge 3-vias por entidade (no cliente, via kernel) gravado como um
  commit de merge com dois pais no destino.

## Arquivos criados

- `packages/cad-core/src/merge.ts` — `mergeDocuments(base, ours, theirs)`: merge
  3-vias por entidade (id) no estilo Git (alterado de um lado, dos dois igual,
  conflito modified-both/modified-deleted/added-both), preserva a ordem e une
  layers/blocks. Puro + testes. Reusa `jsonStable.ts` (extraído do diff).
- `apps/api/src/repositories/mergeRequests.repo.ts` — MRs e revisões, isolados
  por tenant.
- `apps/api/src/modules/versioning/mergeRequests.routes.ts` — rotas do MR.
- Migration `apps/api/drizzle/0003_typical_wither.sql`.
- Testes `apps/api/src/modules/versioning/mergeRequests.test.ts` e
  `packages/cad-core/src/merge.test.ts`.

## Arquivos alterados

- `apps/api/src/db/schema.ts` — `commits.mergeParentId` (2º pai do commit de
  merge); tabelas `merge_requests` e `merge_request_reviews`.
- `apps/api/src/repositories/commits.repo.ts` — `mergeParentId` nos metadados e
  no commit; `findMergeBase` (LCA no grafo de commits, seguindo parent/mergeParent).
- `apps/api/src/app.ts` — monta as rotas de MR.
- `packages/cad-core/src/{diff.ts,index.ts}` — `stableStringify` compartilhado e
  export de `mergeDocuments`.

## Endpoints (protegidos, isolados por tenant)

- `POST /api/v1/drawings/:id/merge-requests` (`{ sourceBranchId, targetBranchId, title, description? }`)
- `GET /api/v1/drawings/:id/merge-requests`
- `GET /api/v1/merge-requests/:id` — inclui `sourceHeadCommitId`,
  `targetHeadCommitId`, `baseCommitId` (LCA) e as revisões
- `POST /api/v1/merge-requests/:id/reviews` (`{ decision: approved|rejected, comment? }`)
- `POST /api/v1/merge-requests/:id/merge` (`{ document }`) — grava o commit de merge

## Decisões técnicas

- **Merge 3-vias no kernel, não no backend:** respeita a fronteira (o backend
  trata o documento como JSON opaco). O cliente busca base/origem/destino, roda
  `mergeDocuments` e, sem conflito, envia o documento mesclado; o backend grava
  o commit de merge (dois pais) e avança o destino.
- **Base de merge (LCA) no grafo:** `findMergeBase` segue `parent`/`mergeParent`
  a partir dos heads — BFS a partir do destino, primeiro ancestral da origem.
- **Dois pais no commit de merge:** `parentId` = head do destino, `mergeParentId`
  = head da origem; a história do destino continua linear por `parentId`.
- **Auditoria:** cada revisão é uma linha imutável; o MR guarda estado e o
  `mergeCommitId`.

## Como testar

```bash
npm run test -w @cad-web/api              # mergeRequests.test.ts
npx vitest run --root packages/cad-core   # merge.test.ts
npx tsc -b
```

## Complemento — UI de merge requests (app web)

`apps/web/src/components/cad/CadMergeRequestsSection.tsx` (no painel Nuvem, com um
desenho aberto): formulário origem→destino + título, lista de MRs com estado,
aprovar/rejeitar e mesclar. O merge roda no cliente com `mergeDocuments`: sem
conflito envia o documento mesclado; com conflito, mostra a contagem e oferece
"aceitar origem". `apiClient.ts` ganhou os métodos de MR. Validado por E2E de
navegador (Chromium + PostgreSQL real): criar branch → abrir MR → aprovar →
mesclar (commit de merge com dois pais no destino).

## Próximos passos

- RBAC: só revisores/coordenadores aprovam e mesclam.
- Resolução de conflitos assistida (escolher lado por entidade).
