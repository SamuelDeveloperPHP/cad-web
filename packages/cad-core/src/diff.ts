import type { CadDocument, CadEntity } from "./index";

/** Resultado da comparacao entre dois documentos, entidade a entidade (por id). */
export type DocumentDiff = Readonly<{
  added: ReadonlyArray<CadEntity>;
  removed: ReadonlyArray<CadEntity>;
  modified: ReadonlyArray<Readonly<{ before: CadEntity; after: CadEntity }>>;
}>;

// Serializa de forma estavel (chaves ordenadas) para comparar entidades sem
// depender da ordem das propriedades no objeto.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

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
