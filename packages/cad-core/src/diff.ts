import type { CadDocument, CadEntity } from "./index";
import { stableStringify } from "./jsonStable";

/** Resultado da comparacao entre dois documentos, entidade a entidade (por id). */
export type DocumentDiff = Readonly<{
  added: ReadonlyArray<CadEntity>;
  removed: ReadonlyArray<CadEntity>;
  modified: ReadonlyArray<Readonly<{ before: CadEntity; after: CadEntity }>>;
}>;

// Indexa as entidades pelo id para comparar os dois documentos em O(n).
function entitiesById(entities: ReadonlyArray<CadEntity>): Map<string, CadEntity> {
  const map = new Map<string, CadEntity>();
  for (const entity of entities) {
    map.set(entity.id, entity);
  }
  return map;
}

/**
 * Compara dois documentos pelas entidades (por id): adicionadas (so no novo),
 * removidas (so no anterior) e modificadas (mesmo id, conteudo diferente).
 * Funcao pura: nao depende de React, Canvas, documento mutavel nem do backend.
 */
export function diffDocuments(previous: CadDocument, next: CadDocument): DocumentDiff {
  const before = entitiesById(previous.entities);
  const after = entitiesById(next.entities);

  const added: CadEntity[] = [];
  const removed: CadEntity[] = [];
  const modified: Array<{ before: CadEntity; after: CadEntity }> = [];

  for (const [id, entity] of after) {
    const old = before.get(id);
    if (old === undefined) {
      added.push(entity);
    } else if (stableStringify(old) !== stableStringify(entity)) {
      modified.push({ before: old, after: entity });
    }
  }

  for (const [id, entity] of before) {
    if (!after.has(id)) {
      removed.push(entity);
    }
  }

  return { added, removed, modified };
}
