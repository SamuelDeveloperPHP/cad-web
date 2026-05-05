import {
  ExtendLineCommand,
  getDocumentSpatialIndex,
  type CadEntity,
  type CircleEntity,
  type LineEntity,
  type RectangleEntity
} from "@cad-web/cad-core";
import {
  buildExtendPreview,
  extendLineToPoint,
  findLineEndpointNearPoint,
  findNearestExtendCandidate,
  getExtendCandidates,
  type ExtendEndpoint,
  type LineEndpointHit,
  type LineParameterSegment,
  type Point2D,
  type TrimCuttingEntity
} from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { findNearestEntityId } from "../selection/hitTesting";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;
const MAX_EXTEND_SEARCH_WORLD = 100_000;

type ExtendPhase = "selecting_boundary_edges" | "extending_segments";

type EndpointLineHit = Readonly<{
  entity: LineEntity;
  endpointHit: LineEndpointHit;
  locked: boolean;
}>;

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

    const hit = findNearestLineEndpoint(context, event.worldPoint, this.getToleranceWorld(context));

    if (hit === null || hit.locked) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const candidate = findNearestExtendCandidate(
      getExtendCandidates(
        hit.entity,
        this.getBoundaryEntities(context, hit.entity, hit.endpointHit.endpoint),
        hit.endpointHit.endpoint
      )
    );

    if (candidate === null) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const previewSegment = buildExtendPreview(hit.entity, candidate);

    if (previewSegment === null) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const preview = {
      type: "ghostEntities" as const,
      entities: [createPreviewLine(hit.entity, previewSegment)]
    };

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

    if (entity === undefined || !isSupportedBoundaryEntity(entity)) {
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
    const hit = findNearestLineEndpoint(context, point, this.getToleranceWorld(context));

    if (hit === null) {
      context.showMessage("[Extend] Select object end to extend");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Extend] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const candidate = findNearestExtendCandidate(
      getExtendCandidates(
        hit.entity,
        this.getBoundaryEntities(context, hit.entity, hit.endpointHit.endpoint),
        hit.endpointHit.endpoint
      )
    );

    if (candidate === null) {
      context.clearPreview();
      context.showMessage("[Extend] No valid boundary found");
      return TOOL_RESULT_NONE;
    }

    const extendedLine = extendLineToPoint(hit.entity, hit.endpointHit.endpoint, candidate.point);
    const updatedEntity: LineEntity = {
      ...hit.entity,
      start: extendedLine.start,
      end: extendedLine.end
    };
    const command = new ExtendLineCommand(hit.entity, updatedEntity, hit.endpointHit.endpoint, candidate.boundaryId);

    context.executeCommand(command);
    context.clearPreview();
    context.showMessage("[Extend] Line extended. Select another endpoint or press Esc");

    return { type: "command", command };
  }

  private getBoundaryEntities(
    context: ToolContext,
    target: LineEntity,
    endpoint: ExtendEndpoint
  ): ReadonlyArray<TrimCuttingEntity> {
    // O modo rápido consulta o índice espacial na direção da extensão para reduzir candidatos por movimento.
    const candidates = this.useAllVisibleBoundaryEdges
      ? getDocumentSpatialIndex(context.document).query(extendSearchBox(target, endpoint, this.getToleranceWorld(context)))
      : context.document.entities.filter((entity) => this.boundaryEdgeIds.has(entity.id));

    return candidates.filter((entity): entity is LineEntity | RectangleEntity | CircleEntity =>
      entity.id !== target.id &&
      isSupportedBoundaryEntity(entity) &&
      isEntityLayerUsable(context, entity)
    );
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

function findNearestLineEndpoint(context: ToolContext, point: Point2D, toleranceWorld: number): EndpointLineHit | null {
  const candidates = getDocumentSpatialIndex(context.document).query({
    minX: point.x - toleranceWorld,
    minY: point.y - toleranceWorld,
    maxX: point.x + toleranceWorld,
    maxY: point.y + toleranceWorld
  });
  let nearestHit: EndpointLineHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of candidates) {
    if (entity.type !== "line" || isLayerVisible(context, entity) === false) {
      continue;
    }

    const endpointHit = findLineEndpointNearPoint(entity, point, toleranceWorld);

    if (endpointHit !== null && endpointHit.distance < nearestDistance) {
      nearestDistance = endpointHit.distance;
      nearestHit = {
        entity,
        endpointHit,
        locked: isLayerLocked(context, entity)
      };
    }
  }

  return nearestHit;
}

function createPreviewLine(original: LineEntity, segment: LineParameterSegment): LineEntity {
  return {
    ...original,
    id: `extend_preview_${original.id}`,
    start: segment.start,
    end: segment.end
  };
}

function extendSearchBox(line: LineEntity, endpoint: ExtendEndpoint, padding: number) {
  const anchor = endpoint === "end" ? line.end : line.start;
  const opposite = endpoint === "end" ? line.start : line.end;
  const direction = {
    x: anchor.x - opposite.x,
    y: anchor.y - opposite.y
  };
  const length = Math.hypot(direction.x, direction.y);

  if (length <= 0) {
    return {
      minX: anchor.x - padding,
      minY: anchor.y - padding,
      maxX: anchor.x + padding,
      maxY: anchor.y + padding
    };
  }

  const farPoint = {
    x: anchor.x + (direction.x / length) * MAX_EXTEND_SEARCH_WORLD,
    y: anchor.y + (direction.y / length) * MAX_EXTEND_SEARCH_WORLD
  };

  return {
    minX: Math.min(anchor.x, farPoint.x) - padding,
    minY: Math.min(anchor.y, farPoint.y) - padding,
    maxX: Math.max(anchor.x, farPoint.x) + padding,
    maxY: Math.max(anchor.y, farPoint.y) + padding
  };
}

function isSupportedBoundaryEntity(entity: CadEntity): entity is LineEntity | RectangleEntity | CircleEntity {
  return entity.type === "line" || entity.type === "rectangle" || entity.type === "circle";
}

function isEntityLayerUsable(context: ToolContext, entity: CadEntity): boolean {
  return isLayerVisible(context, entity) && !isLayerLocked(context, entity);
}

function isLayerVisible(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));

  return layer?.visible !== false;
}

function isLayerLocked(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));

  return layer?.locked === true;
}
