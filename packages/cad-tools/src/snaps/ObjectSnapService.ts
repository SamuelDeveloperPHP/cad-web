import {
  DEFAULT_SNAP_SETTINGS,
  findBestSnap,
  snapToleranceWorld,
  type Point2D,
  type SnapEntity,
  type SnapResult,
  type SnapSettings
} from "@cad-web/cad-geometry";
import { entityBoundingBox, expandBlockReference, getDocumentSpatialIndex, type BlockDefinition, type CadEntity } from "@cad-web/cad-core";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolPointerEvent } from "../contracts/ToolEvent";
import type { SnapService } from "../contracts/ToolContext";

// Máximo de entidades avaliadas por consulta de snap. A interseção compara todos os pares (O(k²)): com o zoom aberto
// em desenho denso, a janela de tolerância cobre milhares de entidades e o movimento do mouse travaria a interface.
// As mais próximas do cursor (por distância ao envoltório) são as que importam, como no AutoCAD.
export const MAX_SNAP_CANDIDATES = 48;

export class ObjectSnapService implements SnapService {
  constructor(private readonly settings: SnapSettings = DEFAULT_SNAP_SETTINGS) {}

  findSnap(
    event: ToolPointerEvent,
    context: ToolContext,
    extraEntities: ReadonlyArray<SnapEntity> = [],
    referencePoint?: Point2D
  ): SnapResult | null {
    if (!this.settings.enabled || this.settings.tolerancePx <= 0) {
      return findBestSnap(
        event.worldPoint,
        event.screenPoint,
        [],
        this.settings,
        context.viewport,
        referencePoint
      );
    }

    const tolerance = snapToleranceWorld(this.settings, context.viewport);
    const searchBox = {
      minX: event.worldPoint.x - tolerance,
      minY: event.worldPoint.y - tolerance,
      maxX: event.worldPoint.x + tolerance,
      maxY: event.worldPoint.y + tolerance
    };

    const spatialIndex = getDocumentSpatialIndex(context.document);
    let candidates = spatialIndex.query(searchBox);

    const invisibleLayerIds = new Set(
      context.document.layers.filter((l) => !l.visible).map((l) => l.id)
    );

    if (invisibleLayerIds.size > 0) {
      candidates = candidates.filter((e) => !invisibleLayerIds.has(e.layerId || "layer_0"));
    }

    // O corte vale antes da expansão dos blocos (poupa expandir milhares de referências) e depois dela.
    if (candidates.length > MAX_SNAP_CANDIDATES) {
      candidates = nearestCandidates(candidates, event.worldPoint, MAX_SNAP_CANDIDATES, context.document.blocks);
    }

    // Referências de bloco viram a geometria expandida (só as peças perto do cursor): os snaps pegam as
    // extremidades, centros e interseções do desenho do bloco. Peças em camadas ocultas ficam de fora.
    if (candidates.some((entity) => entity.type === "block")) {
      const hidden = invisibleLayerIds;
      candidates = candidates.flatMap((entity): ReadonlyArray<CadEntity> => {
        if (entity.type !== "block") {
          return [entity];
        }

        return expandBlockReference(context.document.blocks, entity).filter((child) => {
          const box = entityBoundingBox(child);
          return !hidden.has(child.layerId || "layer_0")
            && box.minX <= searchBox.maxX && box.maxX >= searchBox.minX && box.minY <= searchBox.maxY && box.maxY >= searchBox.minY;
        });
      });
    }

    if (candidates.length > MAX_SNAP_CANDIDATES) {
      candidates = nearestCandidates(candidates, event.worldPoint, MAX_SNAP_CANDIDATES);
    }

    // As entidades extras da ferramenta ativa entram junto dos candidatos do índice espacial.
    const allCandidates = extraEntities.length > 0
      ? [...(candidates as ReadonlyArray<SnapEntity>), ...extraEntities]
      : (candidates as ReadonlyArray<SnapEntity>);

    return findBestSnap(
      event.worldPoint,
      event.screenPoint,
      allCandidates,
      this.settings,
      context.viewport,
      referencePoint
    );
  }
}

// As `limit` entidades de menor distância (ao envoltório) do ponto, da mais próxima para a mais distante.
export function nearestCandidates(
  candidates: ReadonlyArray<CadEntity>,
  point: Point2D,
  limit: number,
  blocks?: ReadonlyArray<BlockDefinition>
): ReadonlyArray<CadEntity> {
  const ranked = candidates.map((entity, order) => {
    const box = entityBoundingBox(entity, blocks);
    const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
    const dy = Math.max(box.minY - point.y, 0, point.y - box.maxY);
    return { entity, order, distance: dx * dx + dy * dy };
  });

  ranked.sort((left, right) => left.distance - right.distance || left.order - right.order);
  return ranked.slice(0, limit).map((item) => item.entity);
}

export function resolveSnappedPoint(
  event: ToolPointerEvent,
  context: ToolContext,
  extraEntities?: ReadonlyArray<SnapEntity>,
  referencePoint?: Point2D
): Point2D {
  return context.snapService.findSnap(event, context, extraEntities, referencePoint)?.point ?? event.worldPoint;
}
