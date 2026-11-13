import type { BlockDefinition, CadDocument, CadEntity, CadLayer } from "./index";
import { stableStringify } from "./jsonStable";

/** Tipo de conflito encontrado ao mesclar duas versoes de um documento. */
export type MergeConflictKind = "modified-both" | "modified-deleted" | "added-both";

/** Um conflito em uma entidade (por id), com as versoes envolvidas. */
export type MergeConflict = Readonly<{
  entityId: string;
  kind: MergeConflictKind;
  base?: CadEntity;
  ours?: CadEntity;
  theirs?: CadEntity;
}>;

/** Resultado do merge: documento mesclado (ou null quando ha conflitos). */
export type MergeResult = Readonly<{
  merged: CadDocument | null;
  conflicts: ReadonlyArray<MergeConflict>;
}>;

function byId(entities: ReadonlyArray<CadEntity>): Map<string, CadEntity> {
  const map = new Map<string, CadEntity>();
  for (const entity of entities) {
    map.set(entity.id, entity);
  }
  return map;
}

function equal(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

// Une duas listas por chave: mantem as de `base` e acrescenta as novas de `extra`.
function unionBy<T>(base: ReadonlyArray<T>, extra: ReadonlyArray<T>, keyOf: (item: T) => string): T[] {
  const result = [...base];
  const have = new Set(base.map(keyOf));
  for (const item of extra) {
    if (!have.has(keyOf(item))) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Mescla tres versoes de um documento no nivel de entidade (por id), no estilo
 * de um merge 3-vias de Git:
 * - alterada so de um lado -> fica a alteracao;
 * - alterada igual dos dois -> fica a alteracao;
 * - alterada diferente dos dois -> conflito (modified-both);
 * - alterada de um lado e removida do outro -> conflito (modified-deleted);
 * - adicionada dos dois com conteudo diferente -> conflito (added-both).
 *
 * Sem conflitos, devolve o documento mesclado: usa o `ours` (destino) como molde,
 * preserva a ordem das entidades (as de `ours` primeiro, depois as adicionadas por
 * `theirs`) e une layers e blocks para nao deixar referencias orfas. Funcao pura.
 */
export function mergeDocuments(
  base: CadDocument,
  ours: CadDocument,
  theirs: CadDocument,
): MergeResult {
  const baseMap = byId(base.entities);
  const oursMap = byId(ours.entities);
  const theirsMap = byId(theirs.entities);
  const ids = new Set<string>([...oursMap.keys(), ...theirsMap.keys(), ...baseMap.keys()]);

  const resolution = new Map<string, CadEntity>();
  const conflicts: MergeConflict[] = [];

  for (const id of ids) {
    const be = baseMap.get(id);
    const oe = oursMap.get(id);
    const te = theirsMap.get(id);

    if (oe !== undefined && te !== undefined) {
      if (be === undefined) {
        // Adicionada pelos dois lados.
        if (equal(oe, te)) {
          resolution.set(id, oe);
        } else {
          conflicts.push({ entityId: id, kind: "added-both", ours: oe, theirs: te });
        }
        continue;
      }
      const oursChanged = !equal(be, oe);
      const theirsChanged = !equal(be, te);
      if (oursChanged && theirsChanged) {
        if (equal(oe, te)) {
          resolution.set(id, oe);
        } else {
          conflicts.push({ entityId: id, kind: "modified-both", base: be, ours: oe, theirs: te });
        }
      } else if (oursChanged) {
        resolution.set(id, oe);
      } else if (theirsChanged) {
        resolution.set(id, te);
      } else {
        resolution.set(id, oe);
      }
    } else if (oe !== undefined && te === undefined) {
      // Ausente em theirs: adicao de ours, ou remocao por theirs.
      if (be === undefined) {
        resolution.set(id, oe);
      } else if (!equal(be, oe)) {
        conflicts.push({ entityId: id, kind: "modified-deleted", base: be, ours: oe });
      }
      // ours inalterada + theirs removeu -> remove (nao resolve).
    } else if (oe === undefined && te !== undefined) {
      // Ausente em ours: adicao de theirs, ou remocao por ours.
      if (be === undefined) {
        resolution.set(id, te);
      } else if (!equal(be, te)) {
        conflicts.push({ entityId: id, kind: "modified-deleted", base: be, theirs: te });
      }
      // theirs inalterada + ours removeu -> remove.
    }
    // Ausente dos dois -> removida de ambos.
  }

  if (conflicts.length > 0) {
    return { merged: null, conflicts };
  }

  // Preserva a ordem: entidades de `ours` primeiro, depois as adicionadas por `theirs`.
  const mergedEntities: CadEntity[] = [];
  const placed = new Set<string>();
  for (const entity of ours.entities) {
    const resolved = resolution.get(entity.id);
    if (resolved !== undefined && !placed.has(entity.id)) {
      mergedEntities.push(resolved);
      placed.add(entity.id);
    }
  }
  for (const entity of theirs.entities) {
    const resolved = resolution.get(entity.id);
    if (resolved !== undefined && !placed.has(entity.id)) {
      mergedEntities.push(resolved);
      placed.add(entity.id);
    }
  }

  const mergedLayers = unionBy<CadLayer>(ours.layers, theirs.layers, (layer) => layer.id);
  const merged: CadDocument = { ...ours, layers: mergedLayers, entities: mergedEntities };

  if (ours.blocks !== undefined || theirs.blocks !== undefined) {
    const mergedBlocks = unionBy<BlockDefinition>(
      ours.blocks ?? [],
      theirs.blocks ?? [],
      (block) => block.name,
    );
    return { merged: { ...merged, blocks: mergedBlocks }, conflicts: [] };
  }

  return { merged, conflicts: [] };
}
