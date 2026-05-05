import {
  getDocumentSpatialIndex,
  TrimLineCommand,
  type CadEntity,
  type CircleEntity,
  type LineEntity,
  type RectangleEntity
} from "@cad-web/cad-core";
import {
  distancePointToSegment,
  trimLineByClick,
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

type TrimPhase = "selecting_cutting_edges" | "trimming_segments";

type LineHit = Readonly<{
  entity: LineEntity;
  locked: boolean;
}>;

export class TrimTool implements CadTool {
  readonly id = "trim";
  readonly name = "Trim";
  readonly aliases = ["tr", "trim"];

  private phase: TrimPhase = "selecting_cutting_edges";
  private readonly cuttingEdgeIds = new Set<string>();
  private useAllVisibleCuttingEdges = false;

  activate(context: ToolContext): void {
    this.reset(context);
    context.showMessage("[Trim] Select cutting edges or press Enter for all");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary") {
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "selecting_cutting_edges") {
      return this.selectCuttingEdge(event.worldPoint, context);
    }

    return this.trimPickedSegment(event.worldPoint, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.phase !== "trimming_segments") {
      return TOOL_RESULT_NONE;
    }

    const hit = findNearestLine(context, event.worldPoint, this.getToleranceWorld(context));

    if (hit === null || hit.locked) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const result = trimLineByClick(
      hit.entity,
      this.getCuttingEntities(context, hit.entity),
      event.worldPoint,
      this.getToleranceWorld(context)
    );

    if (result.removedSegment === null) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const preview = {
      type: "ghostEntities" as const,
      entities: [createPreviewLine(hit.entity, result.removedSegment)]
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
      context.showMessage("[Trim] Cancelled");
      return { type: "cancel" };
    }

    if (event.key === "Enter" && this.phase === "selecting_cutting_edges") {
      return this.confirmCuttingEdges(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const command = input.trim().toLowerCase();

    if (this.phase === "selecting_cutting_edges" && (command.length === 0 || command === "all")) {
      return this.confirmCuttingEdges(context);
    }

    return TOOL_RESULT_NONE;
  }

  private selectCuttingEdge(point: Point2D, context: ToolContext): ToolResult {
    const hitId = findNearestEntityId(context.document, {
      worldPoint: point,
      toleranceWorld: this.getToleranceWorld(context)
    });

    if (hitId === null) {
      context.showMessage("[Trim] Select cutting edges or press Enter for all");
      return TOOL_RESULT_NONE;
    }

    const entity = context.document.entities.find((candidate) => candidate.id === hitId);

    if (entity === undefined || !isSupportedCuttingEntity(entity)) {
      context.showMessage("[Trim] Cutting edge type not supported");
      return TOOL_RESULT_NONE;
    }

    if (!isEntityLayerUsable(context, entity)) {
      context.showMessage("[Trim] Cutting edge layer is hidden or locked");
      return TOOL_RESULT_NONE;
    }

    this.cuttingEdgeIds.add(entity.id);
    context.selectEntities([...this.cuttingEdgeIds]);
    context.showMessage("[Trim] Cutting edge selected. Press Enter to trim");

    return TOOL_RESULT_NONE;
  }

  private confirmCuttingEdges(context: ToolContext): ToolResult {
    this.useAllVisibleCuttingEdges = this.cuttingEdgeIds.size === 0;
    this.phase = "trimming_segments";
    context.clearSelection();
    context.clearPreview();
    context.showMessage("[Trim] Select line segment to trim");

    return TOOL_RESULT_NONE;
  }

  private trimPickedSegment(point: Point2D, context: ToolContext): ToolResult {
    const hit = findNearestLine(context, point, this.getToleranceWorld(context));

    if (hit === null) {
      context.showMessage("[Trim] Select line segment to trim");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Trim] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const result = trimLineByClick(
      hit.entity,
      this.getCuttingEntities(context, hit.entity),
      point,
      this.getToleranceWorld(context)
    );

    if (result.removedSegment === null) {
      context.clearPreview();
      context.showMessage(result.warnings[0] ?? "[Trim] No valid cutting edge found");
      return TOOL_RESULT_NONE;
    }

    const resultEntities = result.resultLines.map((segment, index) =>
      createTrimResultLine(hit.entity, segment, index)
    );
    const command = new TrimLineCommand(hit.entity, resultEntities);

    context.executeCommand(command);
    context.clearPreview();
    context.showMessage("[Trim] Segment trimmed. Select another segment or press Esc");

    return { type: "command", command };
  }

  private getCuttingEntities(context: ToolContext, target: LineEntity): ReadonlyArray<TrimCuttingEntity> {
    // O modo rápido consulta o índice espacial ao redor da linha alvo para evitar varreduras amplas.
    const candidates = this.useAllVisibleCuttingEdges
      ? getDocumentSpatialIndex(context.document).query(lineSearchBox(target, this.getToleranceWorld(context)))
      : context.document.entities.filter((entity) => this.cuttingEdgeIds.has(entity.id));

    return candidates.filter((entity): entity is LineEntity | RectangleEntity | CircleEntity =>
      entity.id !== target.id &&
      isSupportedCuttingEntity(entity) &&
      isEntityLayerUsable(context, entity)
    );
  }

  private getToleranceWorld(context: ToolContext): number {
    return DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale;
  }

  private reset(context: ToolContext): void {
    this.phase = "selecting_cutting_edges";
    this.cuttingEdgeIds.clear();
    this.useAllVisibleCuttingEdges = false;
    context.clearPreview();
    context.clearSelection();
  }
}

function findNearestLine(context: ToolContext, point: Point2D, toleranceWorld: number): LineHit | null {
  const spatialIndex = getDocumentSpatialIndex(context.document);
  const candidates = spatialIndex.query({
    minX: point.x - toleranceWorld,
    minY: point.y - toleranceWorld,
    maxX: point.x + toleranceWorld,
    maxY: point.y + toleranceWorld
  });
  let nearestHit: LineHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of candidates) {
    if (entity.type !== "line" || isLayerVisible(context, entity) === false) {
      continue;
    }

    const distance = distancePointToSegment(point, entity.start, entity.end);

    if (distance <= toleranceWorld && distance < nearestDistance) {
      nearestDistance = distance;
      nearestHit = {
        entity,
        locked: isLayerLocked(context, entity)
      };
    }
  }

  return nearestHit;
}

function createPreviewLine(original: LineEntity, segment: LineParameterSegment): LineEntity {
  return {
    ...original,
    id: `trim_preview_${original.id}`,
    start: segment.start,
    end: segment.end
  };
}

function createTrimResultLine(original: LineEntity, segment: LineParameterSegment, index: number): LineEntity {
  return {
    ...original,
    id: index === 0 ? original.id : createTrimSegmentId(original.id, index),
    start: segment.start,
    end: segment.end
  };
}

function createTrimSegmentId(originalId: string, index: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${originalId}_trim_${crypto.randomUUID()}`;
  }

  return `${originalId}_trim_${index}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function lineSearchBox(line: LineEntity, padding: number) {
  return {
    minX: Math.min(line.start.x, line.end.x) - padding,
    minY: Math.min(line.start.y, line.end.y) - padding,
    maxX: Math.max(line.start.x, line.end.x) + padding,
    maxY: Math.max(line.start.y, line.end.y) + padding
  };
}

function isSupportedCuttingEntity(entity: CadEntity): entity is LineEntity | RectangleEntity | CircleEntity {
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
