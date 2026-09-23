import {
  ExtendLineCommand,
  ReplaceEntityCommand,
  type CadEntity,
  type LineEntity
} from "@cad-web/cad-core";
import {
  buildExtendPreview,
  curveIntersectionParams,
  curveOfEntity,
  distance,
  ellipseBoundingBox,
  entityWithSpan,
  extendPeriodicCurve,
  lineExtendCandidatesFromPrimitives,
  spanEndpoints,
  type BoundingBox,
  type ExtendEndpoint,
  type Point2D
} from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { findNearestEntityId } from "../selection/hitTesting";
import {
  collectBoundaryEntities,
  findNearestEditable,
  hasIntersectGeometry,
  isCurveEntity,
  isEntityLayerUsable,
  isPathEntity,
  padBox,
  toBoundaryPrimitives,
  type CurveEntity,
  type EditableEntity,
  type PathEntity
} from "./curveEditUtils";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;
const MAX_EXTEND_SEARCH_WORLD = 100_000;

type ExtendPhase = "selecting_boundary_edges" | "extending_segments";

type ExtendPlan = Readonly<{
  command: ExtendLineCommand | ReplaceEntityCommand;
  addedPreview: CadEntity;
}>;

/**
 * Ferramenta Extend: estende linhas, arcos e arcos de elipse até o limite mais próximo, pela ponta
 * mais próxima do clique (como no AutoCAD, basta clicar na metade do objeto perto da ponta).
 * Qualquer entidade com geometria (linha, retângulo, polyline, círculo, arco, elipse) serve de limite.
 */
export class ExtendTool implements CadTool {
  readonly id = "extend";
  readonly name = "Extend";
  readonly aliases = ["ex", "extend"];

  private phase: ExtendPhase = "selecting_boundary_edges";
  private readonly boundaryEdgeIds = new Set<string>();
  private useAllVisibleBoundaryEdges = false;

  activate(context: ToolContext): void {
    this.reset(context);
    context.showMessage("[Extend] Select boundary edges or press Enter for all");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary") {
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "selecting_boundary_edges") {
      return this.selectBoundaryEdge(event.worldPoint, context);
    }

    return this.extendPickedEndpoint(event.worldPoint, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.phase !== "extending_segments") {
      return TOOL_RESULT_NONE;
    }

    const hit = findNearestEditable(context, event.worldPoint, this.getToleranceWorld(context), isExtendable);

    if (hit === null || hit.locked) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const plan = this.planExtend(hit.entity, event.worldPoint, context);

    if (typeof plan === "string") {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const preview = { type: "ghostEntities" as const, entities: [plan.addedPreview] };
    context.setPreview(preview);

    return { type: "preview", preview };
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.reset(context);
      context.showMessage("[Extend] Cancelled");
      return { type: "cancel" };
    }

    if (event.key === "Enter" && this.phase === "selecting_boundary_edges") {
      return this.confirmBoundaryEdges(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const command = input.trim().toLowerCase();

    if (this.phase === "selecting_boundary_edges" && (command.length === 0 || command === "all")) {
      return this.confirmBoundaryEdges(context);
    }

    return TOOL_RESULT_NONE;
  }

  private selectBoundaryEdge(point: Point2D, context: ToolContext): ToolResult {
    const hitId = findNearestEntityId(context.document, {
      worldPoint: point,
      toleranceWorld: this.getToleranceWorld(context)
    });

    if (hitId === null) {
      context.showMessage("[Extend] Select boundary edges or press Enter for all");
      return TOOL_RESULT_NONE;
    }

    const entity = context.document.entities.find((candidate) => candidate.id === hitId);

    if (entity === undefined || !hasIntersectGeometry(entity)) {
      context.showMessage("[Extend] Boundary type not supported");
      return TOOL_RESULT_NONE;
    }

    if (!isEntityLayerUsable(context, entity)) {
      context.showMessage("[Extend] Boundary layer is hidden or locked");
      return TOOL_RESULT_NONE;
    }

    this.boundaryEdgeIds.add(entity.id);
    context.selectEntities([...this.boundaryEdgeIds]);
    context.showMessage("[Extend] Boundary selected. Press Enter to extend");

    return TOOL_RESULT_NONE;
  }

  private confirmBoundaryEdges(context: ToolContext): ToolResult {
    this.useAllVisibleBoundaryEdges = this.boundaryEdgeIds.size === 0;
    this.phase = "extending_segments";
    context.clearSelection();
    context.clearPreview();
    context.showMessage("[Extend] Select object end to extend");

    return TOOL_RESULT_NONE;
  }

  private extendPickedEndpoint(point: Point2D, context: ToolContext): ToolResult {
    const hit = findNearestEditable(context, point, this.getToleranceWorld(context), isExtendable);

    if (hit === null) {
      context.showMessage("[Extend] Select object end to extend");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Extend] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const plan = this.planExtend(hit.entity, point, context);

    if (typeof plan === "string") {
      context.clearPreview();
      context.showMessage(plan);
      return TOOL_RESULT_NONE;
    }

    context.executeCommand(plan.command);
    context.clearPreview();
    context.showMessage("[Extend] Extended. Select another object end or press Esc");

    return { type: "command", command: plan.command };
  }

  private planExtend(target: EditableEntity, point: Point2D, context: ToolContext): ExtendPlan | string {
    const tolerance = this.getToleranceWorld(context);

    if (target.type === "line") {
      const endpoint: ExtendEndpoint = distance(point, target.start) <= distance(point, target.end) ? "start" : "end";
      const boundaries = collectBoundaryEntities(
        context,
        this.boundaryEdgeIds,
        this.useAllVisibleBoundaryEdges,
        extendSearchBox(target, endpoint, tolerance),
        target.id
      );
      const candidate = lineExtendCandidatesFromPrimitives(target, toBoundaryPrimitives(boundaries), endpoint)[0];

      if (candidate === undefined) {
        return "[Extend] No valid boundary found";
      }

      const updated: LineEntity = endpoint === "start" ? { ...target, start: candidate.point } : { ...target, end: candidate.point };
      const added = buildExtendPreview(target, candidate);

      return {
        command: new ExtendLineCommand(target, updated, endpoint, candidate.boundaryId),
        addedPreview: { ...target, id: `extend_preview_${target.id}`, start: added?.start ?? target.start, end: added?.end ?? target.end }
      };
    }

    if (isPathEntity(target)) {
      return this.planPolylineExtend(target, point, context, tolerance);
    }

    if (target.type === "spline") {
      return "[Extend] Splines cannot be extended yet";
    }

    return this.planCurveExtend(target, point, context, tolerance);
  }

  /**
   * Estende a ponta de uma polyline aberta prolongando o primeiro ou o último segmento até o limite.
   * Retângulos e polylines fechadas não têm ponta.
   */
  private planPolylineExtend(target: PathEntity, point: Point2D, context: ToolContext, tolerance: number): ExtendPlan | string {
    if (target.type === "rectangle" || target.closed || target.points.length < 2) {
      return "[Extend] Closed shapes cannot be extended";
    }

    const points = target.points;
    const last = points.length - 1;
    const atStart = distance(point, points[0]!) <= distance(point, points[last]!);
    // O segmento da ponta, orientado para fora: a extensão acontece na ponta "end" dele.
    const segment = atStart
      ? { type: "line" as const, start: points[1]!, end: points[0]! }
      : { type: "line" as const, start: points[last - 1]!, end: points[last]! };
    const boundaries = collectBoundaryEntities(
      context,
      this.boundaryEdgeIds,
      this.useAllVisibleBoundaryEdges,
      extendSearchBox({ ...segment, id: target.id, layerId: target.layerId }, "end", tolerance),
      target.id
    );
    const candidate = lineExtendCandidatesFromPrimitives(segment, toBoundaryPrimitives(boundaries), "end")[0];

    if (candidate === undefined) {
      return "[Extend] No valid boundary found";
    }

    const updatedPoints = atStart ? [candidate.point, ...points.slice(1)] : [...points.slice(0, last), candidate.point];

    return {
      command: new ReplaceEntityCommand(target, [{ ...target, points: updatedPoints }], "Extends a polyline end."),
      addedPreview: { ...target, id: `extend_preview_${target.id}`, points: [segment.end, candidate.point], closed: false }
    };
  }

  private planCurveExtend(target: CurveEntity, point: Point2D, context: ToolContext, tolerance: number): ExtendPlan | string {
    const { curve, span } = curveOfEntity(target);

    if (span === null) {
      return "[Extend] Closed circles and ellipses cannot be extended";
    }

    const ends = spanEndpoints(curve, span);
    const endpoint: ExtendEndpoint = distance(point, ends.start) <= distance(point, ends.end) ? "start" : "end";
    const boundaries = collectBoundaryEntities(
      context,
      this.boundaryEdgeIds,
      this.useAllVisibleBoundaryEdges,
      padBox(fullCurveBox(target), tolerance),
      target.id
    );
    const params = curveIntersectionParams(curve, toBoundaryPrimitives(boundaries).map((boundary) => boundary.primitive));
    const extended = extendPeriodicCurve(span, params, endpoint);

    if (extended === null) {
      return "[Extend] No valid boundary found";
    }

    const addedSpan = endpoint === "end"
      ? { start: span.start + span.sweep, sweep: extended.sweep - span.sweep }
      : { start: extended.start, sweep: extended.sweep - span.sweep };

    return {
      command: new ReplaceEntityCommand(target, [{ ...entityWithSpan(target, extended), id: target.id } as CadEntity], "Extends a curve."),
      addedPreview: { ...entityWithSpan(target, addedSpan), id: `extend_preview_${target.id}` } as CadEntity
    };
  }

  private getToleranceWorld(context: ToolContext): number {
    return DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale;
  }

  private reset(context: ToolContext): void {
    this.phase = "selecting_boundary_edges";
    this.boundaryEdgeIds.clear();
    this.useAllVisibleBoundaryEdges = false;
    context.clearPreview();
    context.clearSelection();
  }
}

// Linhas, curvas abertas (arco, arco de elipse) e polylines abertas; formas fechadas recebem uma mensagem clara.
function isExtendable(entity: CadEntity): entity is EditableEntity {
  return entity.type === "line" || isCurveEntity(entity) || isPathEntity(entity) || entity.type === "spline";
}

// A extensão de uma curva nunca sai da curva completa: basta buscar limites no envoltório dela.
function fullCurveBox(target: CurveEntity): BoundingBox {
  if (target.type === "ellipse") {
    return ellipseBoundingBox(target.center, target.radiusX, target.radiusY, target.rotation);
  }

  return {
    minX: target.center.x - target.radius,
    minY: target.center.y - target.radius,
    maxX: target.center.x + target.radius,
    maxY: target.center.y + target.radius
  };
}

function extendSearchBox(line: LineEntity, endpoint: ExtendEndpoint, padding: number): BoundingBox {
  const anchor = endpoint === "end" ? line.end : line.start;
  const opposite = endpoint === "end" ? line.start : line.end;
  const direction = { x: anchor.x - opposite.x, y: anchor.y - opposite.y };
  const length = Math.hypot(direction.x, direction.y);

  if (length <= 0) {
    return padBox({ minX: anchor.x, minY: anchor.y, maxX: anchor.x, maxY: anchor.y }, padding);
  }

  const farPoint = {
    x: anchor.x + (direction.x / length) * MAX_EXTEND_SEARCH_WORLD,
    y: anchor.y + (direction.y / length) * MAX_EXTEND_SEARCH_WORLD
  };

  return padBox({
    minX: Math.min(anchor.x, farPoint.x),
    minY: Math.min(anchor.y, farPoint.y),
    maxX: Math.max(anchor.x, farPoint.x),
    maxY: Math.max(anchor.y, farPoint.y)
  }, padding);
}
