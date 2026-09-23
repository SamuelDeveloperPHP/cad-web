import { ReplaceEntityCommand, UpdateEntityCommand, type CadEntity, type DimensionEntity, type EntityId } from "@cad-web/cad-core";
import {
  addVertexAtGrip,
  getDimensionGripPoints,
  getEntityGripPoints,
  gripVertexOptions,
  removeVertexAtGrip,
  supportsEntityGrips,
  updateDimensionByGrip,
  updateEntityByGrip,
  type GripEntityShape,
  type Point2D
} from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { parseDirectInput, resolveDirectInput } from "../draw/directInput";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import { findNearestEntityId } from "./hitTesting";
import { boxSelectionMode, entitiesInSelectionBox } from "./boxSelection";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;
const GRIP_TOLERANCE_PIXELS = 10;
// Acima disso os grips das entidades selecionadas não são mostrados (seleções grandes ficam leves).
export const MAX_GRIP_ENTITIES = 50;
const BOX_DRAG_THRESHOLD_PIXELS = 4;
// Clique sem arrasto no grip (abaixo deste deslocamento) deixa o grip "quente", como no AutoCAD.
const GRIP_CLICK_THRESHOLD_PIXELS = 4;
const GRIP_KEYS: ReadonlySet<string> = new Set(["Delete", "Backspace", "a", "A", "r", "R"]);

type PendingSelection = Readonly<{
  startWorld: Point2D;
  startScreen: Point2D;
  entityUnderCursor: EntityId | null;
  boxing: boolean;
}>;

// Entidades com grips editáveis: cotas (seleção única) e as geometrias com grips do kernel.
type GripEntity = CadEntity;

type GripHit = Readonly<{
  entity: GripEntity;
  gripId: string;
  point: Point2D;
  locked: boolean;
}>;

/**
 * Grip em edição. documentEntity é a entidade do documento (alvo do comando); baseEntity é a entidade de
 * onde a edição é calculada (difere dela depois de inserir um vértice). No modo "dragging" o botão está
 * pressionado; no modo "hot" o grip segue o cursor até o próximo clique ou coordenada digitada.
 */
type GripEditState = Readonly<{
  documentEntity: GripEntity;
  baseEntity: GripEntity;
  gripId: string;
  basePoint: Point2D;
  downScreen: Point2D;
  lastPoint: Point2D;
  mode: "dragging" | "hot";
}>;

export class SelectTool implements CadTool {
  readonly id = "select";
  readonly name = "Select";
  readonly aliases = ["sel", "select"];

  private grip: GripEditState | null = null;
  private suppressNextPointerUp = false;
  private pending: PendingSelection | null = null;

  activate(context: ToolContext): void {
    context.showMessage("Select entity or drag a selection window.");
  }

  deactivate(context: ToolContext): void {
    this.grip = null;
    this.pending = null;
    this.suppressNextPointerUp = false;
    context.clearPreview();
  }

  claimsKeyDown(event: ToolKeyboardEvent): boolean {
    return this.grip !== null && GRIP_KEYS.has(event.key);
  }

  claimsCommandInput(_input: string): boolean {
    return this.grip !== null;
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    // Grip quente: o clique define o novo ponto.
    if (this.grip !== null && this.grip.mode === "hot") {
      this.suppressNextPointerUp = true;
      return this.commitGrip(resolveSnappedPoint(event, context), context);
    }

    const gripHit = findGripHit(context, event);

    if (gripHit !== null) {
      if (gripHit.locked) {
        context.showMessage("[Grip] Layer is locked.");
        return TOOL_RESULT_NONE;
      }

      this.grip = {
        documentEntity: gripHit.entity,
        baseEntity: gripHit.entity,
        gripId: gripHit.gripId,
        basePoint: gripHit.point,
        downScreen: event.screenPoint,
        lastPoint: gripHit.point,
        mode: "dragging"
      };

      const preview: CadPreview = { type: "ghostEntities", entities: [gripHit.entity] };
      context.setPreview(preview);
      context.showMessage(gripHit.entity.type === "dimension"
        ? "[Grip] Drag dimension grip. Release to update dimension. Press Esc to cancel."
        : `[Grip] Drag ${gripHit.entity.type} grip. Release to update. Press Esc to cancel.`);

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
    if (this.grip !== null) {
      const point = resolveSnappedPoint(event, context);
      this.grip = { ...this.grip, lastPoint: point };
      return this.previewGrip(point, context);
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
    if (this.suppressNextPointerUp) {
      this.suppressNextPointerUp = false;
      return TOOL_RESULT_NONE;
    }

    if (this.grip !== null && this.grip.mode === "dragging") {
      const moved = Math.hypot(event.screenPoint.x - this.grip.downScreen.x, event.screenPoint.y - this.grip.downScreen.y);

      // Clique sem arrasto: o grip fica quente e segue o cursor (clique, coordenada ou opção define o ponto).
      if (moved < GRIP_CLICK_THRESHOLD_PIXELS) {
        this.grip = { ...this.grip, mode: "hot" };
        context.showMessage(hotGripMessage(this.grip));
        return TOOL_RESULT_NONE;
      }

      return this.commitGrip(resolveSnappedPoint(event, context), context);
    }

    if (this.grip !== null) {
      return TOOL_RESULT_NONE;
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
      if (this.grip !== null) {
        this.grip = null;
        this.suppressNextPointerUp = false;
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

    if (this.grip !== null) {
      const key = event.key.toLowerCase();

      if (key === "a") return this.addVertex(context);
      if (key === "r" || key === "delete" || key === "backspace") return this.removeVertex(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    if (this.grip === null) {
      return TOOL_RESULT_NONE;
    }

    const command = input.trim().toLowerCase();

    if (command === "a" || command === "add") return this.addVertex(context);
    if (command === "r" || command === "remove" || command === "del" || command === "delete") return this.removeVertex(context);
    if (command.length === 0) return TOOL_RESULT_NONE;

    // Coordenadas na unidade de trabalho: x,y absoluto; @dx,dy e @d<a relativos ao ponto original do grip;
    // uma distância segue a direção do cursor a partir dele.
    const direction = { x: this.grip.lastPoint.x - this.grip.basePoint.x, y: this.grip.lastPoint.y - this.grip.basePoint.y };
    const point = resolveDirectInput(
      parseDirectInput(input),
      this.grip.basePoint,
      Math.hypot(direction.x, direction.y) > 0 ? direction : null,
      context.unitScale
    );

    if (point === null) {
      const message = "[Grip] Invalid point. Type x,y, @dx,dy, @distance<angle, A (add vertex) or R (remove vertex).";
      context.showMessage(message);
      return { type: "error", message };
    }

    return this.commitGrip(point, context);
  }

  private previewGrip(point: Point2D, context: ToolContext): ToolResult {
    const updated = this.grip === null ? null : applyGrip(this.grip, point);

    // Geometria degenerada (ex.: arco por três pontos alinhados): mantém o último preview válido.
    if (updated === null) {
      return TOOL_RESULT_NONE;
    }

    const preview: CadPreview = { type: "ghostEntities", entities: [updated] };
    context.setPreview(preview);
    return { type: "preview", preview };
  }

  private commitGrip(point: Point2D, context: ToolContext): ToolResult {
    const grip = this.grip;

    if (grip === null) {
      return TOOL_RESULT_NONE;
    }

    const updated = applyGrip(grip, point);

    if (updated === null) {
      const message = "[Grip] Invalid geometry for this point.";
      context.showMessage(message);
      return { type: "error", message };
    }

    this.grip = null;
    return this.executeGripResult(grip.documentEntity, updated, context);
  }

  private executeGripResult(original: GripEntity, updated: GripEntity, context: ToolContext): ToolResult {
    const previousSelection = context.selection.entityIds;

    if (updated.type === "dimension") {
      context.executeCommand(new UpdateEntityCommand(updated.id, {
        definition: updated.definition
      } as Partial<DimensionEntity>));
      context.selectEntities([updated.id]);
      context.showMessage("[Grip] Dimension updated.");
    } else {
      context.executeCommand(new ReplaceEntityCommand(original, [updated], `Edits a ${updated.type} by grip.`));
      // A seleção continua a mesma (os grips das outras entidades selecionadas seguem visíveis).
      context.selectEntities(previousSelection.includes(updated.id) ? previousSelection : [updated.id]);
      context.showMessage(`[Grip] ${capitalize(updated.type)} updated.`);
    }

    context.clearPreview();
    return { type: "complete" };
  }

  // Insere um vértice após o grip (polyline ou ponto de ajuste) e passa a editar o vértice novo.
  private addVertex(context: ToolContext): ToolResult {
    const grip = this.grip;

    if (grip === null || !supportsEntityGrips(grip.baseEntity)) {
      return this.vertexUnavailable(context, "add");
    }

    const base = grip.baseEntity as GripEntityShape;

    if (!gripVertexOptions(base, grip.gripId).canAdd) {
      return this.vertexUnavailable(context, "add");
    }

    const added = addVertexAtGrip(base, grip.gripId, grip.lastPoint)!;
    this.grip = {
      ...grip,
      baseEntity: added.entity as unknown as GripEntity,
      gripId: added.gripId,
      basePoint: grip.lastPoint,
      mode: "hot"
    };
    this.suppressNextPointerUp = grip.mode === "dragging";
    context.showMessage("[Grip] Vertex added. Click or type the new vertex position. Press Esc to cancel.");
    return this.previewGrip(grip.lastPoint, context);
  }

  private removeVertex(context: ToolContext): ToolResult {
    const grip = this.grip;

    if (grip === null || !supportsEntityGrips(grip.baseEntity)) {
      return this.vertexUnavailable(context, "remove");
    }

    const updated = removeVertexAtGrip(grip.baseEntity as GripEntityShape, grip.gripId);

    if (updated === null) {
      return this.vertexUnavailable(context, "remove");
    }

    this.grip = null;
    this.suppressNextPointerUp = grip.mode === "dragging";
    return this.executeGripResult(grip.documentEntity, updated as unknown as GripEntity, context);
  }

  private vertexUnavailable(context: ToolContext, action: "add" | "remove"): ToolResult {
    const message = action === "add"
      ? "[Grip] Add vertex works on polyline vertices, polyline segment midpoints and spline fit points."
      : "[Grip] Remove vertex works on polyline vertices and spline fit points (keeping the minimum count).";
    context.showMessage(message);
    return { type: "error", message };
  }
}

function applyGrip(grip: GripEditState, point: Point2D): GripEntity | null {
  if (grip.baseEntity.type === "dimension") {
    return updateDimensionByGrip(grip.baseEntity as any, grip.gripId, point) as DimensionEntity;
  }

  if (!supportsEntityGrips(grip.baseEntity)) {
    return null;
  }

  return updateEntityByGrip(grip.baseEntity as GripEntityShape, grip.gripId, point) as unknown as GripEntity | null;
}

function hotGripMessage(grip: GripEditState): string {
  const options = supportsEntityGrips(grip.baseEntity) ? gripVertexOptions(grip.baseEntity as GripEntityShape, grip.gripId) : { canAdd: false, canRemove: false };
  const extras = [options.canAdd ? "A = add vertex" : null, options.canRemove ? "R/Delete = remove vertex" : null].filter((item) => item !== null);
  return `[Grip] Specify point (click, x,y, @dx,dy or @d<a)${extras.length > 0 ? `, ${extras.join(", ")}` : ""}. Esc cancels.`;
}

// Entidades selecionadas cujos grips estão visíveis: a cota da seleção única ou as entidades com grips.
export function gripEntitiesOfSelection(document: ToolContext["document"], selectedIds: ReadonlyArray<EntityId>): ReadonlyArray<GripEntity> {
  const selected = new Set(selectedIds);
  const entities = document.entities.filter((entity) => selected.has(entity.id));

  if (entities.length === 1 && entities[0]!.type === "dimension") {
    return [entities[0]!];
  }

  const editable = entities.filter((entity) => supportsEntityGrips(entity));
  return editable.length <= MAX_GRIP_ENTITIES ? editable : [];
}

function gripsOf(entity: GripEntity): ReadonlyArray<Readonly<{ id: string; point: Point2D }>> {
  if (entity.type === "dimension") {
    return getDimensionGripPoints(entity as any);
  }

  return supportsEntityGrips(entity) ? getEntityGripPoints(entity as GripEntityShape) : [];
}

function findGripHit(context: ToolContext, event: ToolPointerEvent): GripHit | null {
  let nearest: GripHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of gripEntitiesOfSelection(context.document, context.selection.entityIds)) {
    const layer = context.document.layers.find((candidate) => candidate.id === entity.layerId);

    if (layer?.visible === false) {
      continue;
    }

    for (const grip of gripsOf(entity)) {
      const gripScreenPoint = worldToScreenPoint(grip.point, context.viewport);
      const gripDistance = distanceBetweenScreenPoints(event.screenPoint, gripScreenPoint);

      if (gripDistance <= GRIP_TOLERANCE_PIXELS && gripDistance < nearestDistance) {
        nearest = { entity, gripId: grip.id, point: grip.point, locked: layer?.locked === true };
        nearestDistance = gripDistance;
      }
    }
  }

  return nearest;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
