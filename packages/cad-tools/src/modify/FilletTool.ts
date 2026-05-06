import {
  FilletLineLineCommand,
  getDocumentSpatialIndex,
  type ArcEntity,
  type CadEntity,
  type LineEntity
} from "@cad-web/cad-core";
import { computeLineLineFillet, distancePointToSegment, type Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;

type FilletPhase = "specify_radius" | "select_first_line" | "select_second_line";

type LineHit = Readonly<{
  entity: LineEntity;
  locked: boolean;
}>;

type FilletSelection = Readonly<{
  entity: LineEntity;
  pickPoint: Point2D;
}>;

export class FilletTool implements CadTool {
  readonly id = "fillet";
  readonly name = "Fillet";
  readonly aliases = ["f", "fillet"];

  private phase: FilletPhase = "specify_radius";
  private radius: number | null = null;
  private firstSelection: FilletSelection | null = null;

  activate(context: ToolContext): void {
    this.firstSelection = null;
    context.clearPreview();
    context.clearSelection();

    if (this.radius === null) {
      this.phase = "specify_radius";
      context.requestNumericInput({ prompt: "[Fillet] Specify radius", min: 0 });
      context.showMessage("[Fillet] Specify radius");
      return;
    }

    this.phase = "select_first_line";
    context.showMessage("[Fillet] Select first line");
  }

  deactivate(context: ToolContext): void {
    this.phase = "specify_radius";
    this.radius = null;
    this.firstSelection = null;
    context.clearPreview();
    context.clearSelection();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary") {
      return TOOL_RESULT_NONE;
    }

    if (this.radius === null || this.phase === "specify_radius") {
      context.showMessage("[Fillet] Specify radius");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "select_first_line") {
      return this.selectFirstLine(event.worldPoint, context);
    }

    return this.selectSecondLine(event.worldPoint, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.phase !== "select_second_line" || this.radius === null || this.firstSelection === null) {
      return TOOL_RESULT_NONE;
    }

    const hit = findNearestLine(context, event.worldPoint, this.getToleranceWorld(context), this.firstSelection.entity.id);

    if (hit === null || hit.locked) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const previewEntities = this.buildFilletEntities(this.firstSelection, hit.entity, event.worldPoint, context, true);

    if (previewEntities === null) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const preview = {
      type: "ghostEntities" as const,
      entities: previewEntities
    };

    context.setPreview(preview);

    return { type: "preview", preview };
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key !== "Escape") {
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "select_second_line") {
      this.firstSelection = null;
      this.phase = "select_first_line";
      context.clearPreview();
      context.clearSelection();
      context.showMessage("[Fillet] Select first line");
      return { type: "cancel" };
    }

    this.firstSelection = null;
    this.phase = this.radius === null ? "specify_radius" : "select_first_line";
    context.clearPreview();
    context.clearSelection();
    context.showMessage("[Fillet] Cancelled");

    return { type: "cancel" };
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const radius = parseFilletRadius(input);

    if (radius === null) {
      context.showMessage("[Fillet] Radius too large or invalid");
      return { type: "error", message: "[Fillet] Radius too large or invalid" };
    }

    this.radius = radius;
    this.firstSelection = null;
    this.phase = "select_first_line";
    context.clearPreview();
    context.clearSelection();
    context.showMessage("[Fillet] Select first line");

    return TOOL_RESULT_NONE;
  }

  private selectFirstLine(point: Point2D, context: ToolContext): ToolResult {
    const hit = findNearestLine(context, point, this.getToleranceWorld(context));

    if (hit === null) {
      context.showMessage("[Fillet] Select first line");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Fillet] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    this.firstSelection = {
      entity: hit.entity,
      pickPoint: point
    };
    this.phase = "select_second_line";
    context.selectEntities([hit.entity.id]);
    context.showMessage("[Fillet] Select second line");

    return TOOL_RESULT_NONE;
  }

  private selectSecondLine(point: Point2D, context: ToolContext): ToolResult {
    if (this.radius === null || this.firstSelection === null) {
      context.showMessage("[Fillet] Specify radius");
      this.phase = "specify_radius";
      return TOOL_RESULT_NONE;
    }

    const hit = findNearestLine(context, point, this.getToleranceWorld(context), this.firstSelection.entity.id);

    if (hit === null) {
      context.showMessage("[Fillet] Select second line");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Fillet] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const filletEntities = this.buildFilletEntities(this.firstSelection, hit.entity, point, context, false);

    if (filletEntities === null) {
      return TOOL_RESULT_NONE;
    }

    const [updatedLine1, updatedLine2, arcEntity] = filletEntities;
    const command = new FilletLineLineCommand(this.firstSelection.entity, hit.entity, updatedLine1, updatedLine2, arcEntity);

    context.executeCommand(command);
    this.firstSelection = null;
    this.phase = "select_first_line";
    context.clearPreview();
    context.clearSelection();
    context.showMessage("[Fillet] Select first line");

    return { type: "command", command };
  }

  private buildFilletEntities(
    firstSelection: FilletSelection,
    secondLine: LineEntity,
    secondPickPoint: Point2D,
    context: ToolContext,
    preview: boolean
  ): [LineEntity, LineEntity, ArcEntity] | null {
    const result = computeLineLineFillet({
      line1: firstSelection.entity,
      line2: secondLine,
      radius: this.radius ?? 0,
      pickPoint1: firstSelection.pickPoint,
      pickPoint2: secondPickPoint,
      tolerance: this.getToleranceWorld(context) * 0.001
    });

    if (!result.ok) {
      context.showMessage(toFilletMessage(result.reason));
      return null;
    }

    const updatedLine1: LineEntity = {
      ...firstSelection.entity,
      start: result.line1Result.start,
      end: result.line1Result.end
    };
    const updatedLine2: LineEntity = {
      ...secondLine,
      start: result.line2Result.start,
      end: result.line2Result.end
    };
    const arcEntity: ArcEntity = createArcEntity(firstSelection.entity, secondLine, result.arc, context, preview);

    return [updatedLine1, updatedLine2, arcEntity];
  }

  private getToleranceWorld(context: ToolContext): number {
    return DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale;
  }
}

function parseFilletRadius(input: string): number | null {
  const trimmedInput = input.trim().toLowerCase();
  const match = trimmedInput.match(/^(?:r|radius|raio)?\s*=?\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);

  if (match === null || match[1] === undefined) {
    return null;
  }

  const radius = Number(match[1]);

  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

function findNearestLine(
  context: ToolContext,
  point: Point2D,
  toleranceWorld: number,
  excludedEntityId?: string
): LineHit | null {
  const candidates = getDocumentSpatialIndex(context.document).query({
    minX: point.x - toleranceWorld,
    minY: point.y - toleranceWorld,
    maxX: point.x + toleranceWorld,
    maxY: point.y + toleranceWorld
  });
  let nearestHit: LineHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of candidates) {
    if (entity.id === excludedEntityId || entity.type !== "line" || isLayerVisible(context, entity) === false) {
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

function createArcEntity(
  line1: LineEntity,
  line2: LineEntity,
  arc: Readonly<{
    center: Point2D;
    radius: number;
    startAngle: number;
    endAngle: number;
    clockwise: boolean;
  }>,
  context: ToolContext,
  preview: boolean
): ArcEntity {
  const layerId = line1.layerId === line2.layerId ? line1.layerId : context.document.activeLayerId;
  const entity: ArcEntity = {
    id: preview ? `fillet_preview_${line1.id}_${line2.id}` : createFilletArcId(line1.id, line2.id),
    layerId,
    type: "arc",
    center: arc.center,
    radius: arc.radius,
    startAngle: arc.startAngle,
    endAngle: arc.endAngle,
    clockwise: arc.clockwise
  };

  return {
    ...entity,
    ...(line1.color !== undefined && line1.color === line2.color ? { color: line1.color } : {}),
    ...(line1.lineThickness !== undefined && line1.lineThickness === line2.lineThickness
      ? { lineThickness: line1.lineThickness }
      : {}),
    ...(line1.lineType !== undefined && line1.lineType === line2.lineType ? { lineType: line1.lineType } : {})
  };
}

function createFilletArcId(line1Id: string, line2Id: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `arc_fillet_${line1Id}_${line2Id}_${crypto.randomUUID()}`;
  }

  return `arc_fillet_${line1Id}_${line2Id}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function toFilletMessage(reason: string): string {
  return reason.toLowerCase().includes("parallel")
    ? "[Fillet] Lines are parallel or invalid"
    : "[Fillet] Radius too large or invalid";
}

function isLayerVisible(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));

  return layer?.visible !== false;
}

function isLayerLocked(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));

  return layer?.locked === true;
}
