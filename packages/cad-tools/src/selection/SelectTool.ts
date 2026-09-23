import { UpdateEntityCommand, type CadEntity, type DimensionEntity, type EntityId, type SplineEntity } from "@cad-web/cad-core";
import { getDimensionGripPoints, getSplineGripPoints, updateDimensionByGrip, updateSplineByGrip, type Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import { findNearestEntityId } from "./hitTesting";
import { boxSelectionMode, entitiesInSelectionBox } from "./boxSelection";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;
const DIMENSION_GRIP_TOLERANCE_PIXELS = 10;
// Acima disso os grips das splines selecionadas não são mostrados (seleções grandes ficam leves).
export const MAX_SPLINE_GRIP_ENTITIES = 50;
const BOX_DRAG_THRESHOLD_PIXELS = 4;

type PendingSelection = Readonly<{
  startWorld: Point2D;
  startScreen: Point2D;
  entityUnderCursor: EntityId | null;
  boxing: boolean;
}>;

// Entidades com grips editáveis: cotas (seleção única) e splines (pontos de ajuste ou de controle).
type GripEntity = DimensionEntity | SplineEntity;

type GripHit = Readonly<{
  entity: GripEntity;
  gripId: string;
  locked: boolean;
}>;

type GripDragState = Readonly<{
  originalEntity: GripEntity;
  gripId: string;
}>;

export class SelectTool implements CadTool {
  readonly id = "select";
  readonly name = "Select";
  readonly aliases = ["sel", "select"];

  private gripDrag: GripDragState | null = null;
  private pending: PendingSelection | null = null;

  activate(context: ToolContext): void {
    context.showMessage("Select entity or drag a selection window.");
  }

  deactivate(context: ToolContext): void {
    this.gripDrag = null;
    this.pending = null;
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const gripHit = findGripHit(context, event);

    if (gripHit !== null) {
      if (gripHit.locked) {
        context.showMessage("[Grip] Layer is locked.");
        return TOOL_RESULT_NONE;
      }

      this.gripDrag = {
        originalEntity: gripHit.entity,
        gripId: gripHit.gripId
      };

      const preview = {
        type: "ghostEntities" as const,
        entities: [gripHit.entity]
      };

      context.setPreview(preview);
      context.showMessage(gripHit.entity.type === "spline"
        ? "[Grip] Drag spline grip. Release to update the spline. Press Esc to cancel."
        : "[Grip] Drag dimension grip. Release to update dimension. Press Esc to cancel.");

      return { type: "preview", preview };
    }

    // A seleção é decidida no release: um clique seleciona a entidade sob o cursor; um arrasto vira janela.
    const entityUnderCursor = findNearestEntityId(context.document, {
      worldPoint: event.worldPoint,
      toleranceWorld: DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale
    });

    this.pending = {
      startWorld: event.worldPoint,
      startScreen: event.screenPoint,
      entityUnderCursor,
      boxing: false
    };

    return TOOL_RESULT_NONE;
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.gripDrag !== null) {
      const updatedEntity = applyGrip(this.gripDrag, resolveSnappedPoint(event, context));
      const preview = {
        type: "ghostEntities" as const,
        entities: [updatedEntity]
      };

      context.setPreview(preview);

      return { type: "preview", preview };
    }

    if (this.pending !== null) {
      // A janela de seleção só começa após arrastar além do limiar e quando não há entidade sob o clique inicial.
      if (!this.pending.boxing) {
        const moved = Math.hypot(
          event.screenPoint.x - this.pending.startScreen.x,
          event.screenPoint.y - this.pending.startScreen.y
        );

        if (moved < BOX_DRAG_THRESHOLD_PIXELS || this.pending.entityUnderCursor !== null) {
          return TOOL_RESULT_NONE;
        }

        this.pending = { ...this.pending, boxing: true };
      }

      const mode = boxSelectionMode(this.pending.startWorld, event.worldPoint);
      const preview: CadPreview = {
        type: "selectionBox",
        start: this.pending.startWorld,
        end: event.worldPoint,
        mode
      };

      context.setPreview(preview);
      return { type: "preview", preview };
    }

    return TOOL_RESULT_NONE;
  }

  onPointerUp(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.gripDrag !== null) {
      const updatedEntity = applyGrip(this.gripDrag, resolveSnappedPoint(event, context));
      const previousSelection = context.selection.entityIds;

      if (updatedEntity.type === "spline") {
        context.executeCommand(new UpdateEntityCommand(updatedEntity.id, {
          controlPoints: updatedEntity.controlPoints,
          ...(updatedEntity.fitPoints !== undefined ? { fitPoints: updatedEntity.fitPoints } : {})
        } as Partial<CadEntity>));
        // A seleção continua a mesma (os grips das outras splines selecionadas seguem visíveis).
        context.selectEntities(previousSelection.includes(updatedEntity.id) ? previousSelection : [updatedEntity.id]);
        context.showMessage("[Grip] Spline updated.");
      } else {
        context.executeCommand(new UpdateEntityCommand(updatedEntity.id, {
          definition: updatedEntity.definition
        } as Partial<DimensionEntity>));
        context.selectEntities([updatedEntity.id]);
        context.showMessage("[Grip] Dimension updated.");
      }

      context.clearPreview();
      this.gripDrag = null;

      return { type: "complete" };
    }

    const pending = this.pending;
    this.pending = null;

    if (pending === null) {
      return TOOL_RESULT_NONE;
    }

    if (pending.boxing) {
      const mode = boxSelectionMode(pending.startWorld, event.worldPoint);
      const ids = entitiesInSelectionBox(context.document, pending.startWorld, event.worldPoint, mode);
      context.clearPreview();
      context.selectEntities(ids);
      context.showMessage(`${ids.length} entit${ids.length === 1 ? "y" : "ies"} selected (${mode}).`);
      return { type: "complete" };
    }

    if (pending.entityUnderCursor !== null) {
      context.selectEntities([pending.entityUnderCursor]);
      return { type: "message", message: `Selected ${pending.entityUnderCursor}.` };
    }

    context.clearSelection();
    return { type: "message", message: "Selection cleared." };
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      if (this.gripDrag !== null) {
        this.gripDrag = null;
        context.clearPreview();
        context.showMessage("[Grip] Edit canceled.");
        return { type: "cancel" };
      }

      if (this.pending !== null) {
        this.pending = null;
        context.clearPreview();
        return { type: "cancel" };
      }

      context.clearSelection();
      return { type: "cancel" };
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(_input: string, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }
}

function applyGrip(drag: GripDragState, point: Point2D): GripEntity {
  if (drag.originalEntity.type === "spline") {
    const update = updateSplineByGrip(drag.originalEntity, drag.gripId, point);
    return update === null ? drag.originalEntity : { ...drag.originalEntity, ...update } as SplineEntity;
  }

  return updateDimensionByGrip(drag.originalEntity as any, drag.gripId, point) as DimensionEntity;
}

// Entidades selecionadas cujos grips estão visíveis: a cota da seleção única e as splines selecionadas.
export function gripEntitiesOfSelection(document: ToolContext["document"], selectedIds: ReadonlyArray<EntityId>): ReadonlyArray<GripEntity> {
  const selected = new Set(selectedIds);
  const entities = document.entities.filter((entity) => selected.has(entity.id));

  if (entities.length === 1 && entities[0]!.type === "dimension") {
    return [entities[0] as DimensionEntity];
  }

  const splines = entities.filter((entity): entity is SplineEntity => entity.type === "spline");
  return splines.length <= MAX_SPLINE_GRIP_ENTITIES ? splines : [];
}

function findGripHit(context: ToolContext, event: ToolPointerEvent): GripHit | null {
  let nearest: GripHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of gripEntitiesOfSelection(context.document, context.selection.entityIds)) {
    const layer = context.document.layers.find((candidate) => candidate.id === entity.layerId);

    if (layer?.visible === false) {
      continue;
    }

    const grips = entity.type === "spline" ? getSplineGripPoints(entity) : getDimensionGripPoints(entity as any);

    for (const grip of grips) {
      const gripScreenPoint = worldToScreenPoint(grip.point, context.viewport);
      const gripDistance = distanceBetweenScreenPoints(event.screenPoint, gripScreenPoint);

      if (gripDistance <= DIMENSION_GRIP_TOLERANCE_PIXELS && gripDistance < nearestDistance) {
        nearest = { entity, gripId: grip.id, locked: layer?.locked === true };
        nearestDistance = gripDistance;
      }
    }
  }

  return nearest;
}

function worldToScreenPoint(point: Point2D, viewport: ToolContext["viewport"]): Point2D {
  return {
    x: (point.x - viewport.origin.x) * viewport.scale,
    y: (point.y - viewport.origin.y) * viewport.scale
  };
}

function distanceBetweenScreenPoints(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
