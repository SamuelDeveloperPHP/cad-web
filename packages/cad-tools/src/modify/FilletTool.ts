import {
  FilletCornerCommand,
  FilletLineLineCommand,
  type ArcEntity,
  type CadEntity,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
} from "@cad-web/cad-core";
import { computeLineLineFillet, type Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import {
  areEdgesAdjacent,
  extractSegments,
  findNearestSegment,
  type SegmentHit
} from "./segmentUtils";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;

type FilletPhase = "specify_radius" | "select_first_line" | "select_second_line";

type FilletSelection = Readonly<{
  hit: SegmentHit;
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
      return this.selectFirstSegment(event.worldPoint, context);
    }

    return this.selectSecondSegment(event.worldPoint, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.phase !== "select_second_line" || this.radius === null || this.firstSelection === null) {
      return TOOL_RESULT_NONE;
    }

    const hit = findNearestSegment(context, event.worldPoint, this.getToleranceWorld(context), getExcludeId(this.firstSelection.hit));

    if (hit === null || hit.locked) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const seg1 = getSegmentGeometry(this.firstSelection.hit);
    const seg2 = getSegmentGeometry(hit);

    if (seg1 === null || seg2 === null) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const filletResult = computeLineLineFillet({
      line1: seg1,
      line2: seg2,
      radius: this.radius,
      pickPoint1: this.firstSelection.pickPoint,
      pickPoint2: event.worldPoint,
      tolerance: this.getToleranceWorld(context) * 0.001
    });

    if (!filletResult.ok) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const previewArc: ArcEntity = {
      id: "fillet_preview_arc",
      layerId: getLayerId(this.firstSelection.hit),
      type: "arc",
      center: filletResult.arc.center,
      radius: filletResult.arc.radius,
      startAngle: filletResult.arc.startAngle,
      endAngle: filletResult.arc.endAngle,
      clockwise: filletResult.arc.clockwise
    };

    const preview = {
      type: "ghostEntities" as const,
      entities: [
        { id: "fillet_preview_l1", layerId: getLayerId(this.firstSelection.hit), type: "line" as const, start: filletResult.line1Result.start, end: filletResult.line1Result.end },
        { id: "fillet_preview_l2", layerId: getLayerId(hit), type: "line" as const, start: filletResult.line2Result.start, end: filletResult.line2Result.end },
        previewArc
      ]
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

    // O raio é digitado na unidade de trabalho; converte para a base (mm).
    this.radius = radius * context.unitScale;
    this.firstSelection = null;
    this.phase = "select_first_line";
    context.clearPreview();
    context.clearSelection();
    context.showMessage("[Fillet] Select first line");

    return TOOL_RESULT_NONE;
  }

  private selectFirstSegment(point: Point2D, context: ToolContext): ToolResult {
    const hit = findNearestSegment(context, point, this.getToleranceWorld(context));

    if (hit === null) {
      context.showMessage("[Fillet] Select first line");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Fillet] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    this.firstSelection = { hit, pickPoint: point };
    this.phase = "select_second_line";

    const entityId = hit.kind === "line" ? hit.entity.id : hit.entity.id;
    context.selectEntities([entityId]);
    context.showMessage("[Fillet] Select second line");

    return TOOL_RESULT_NONE;
  }

  private selectSecondSegment(point: Point2D, context: ToolContext): ToolResult {
    if (this.radius === null || this.firstSelection === null) {
      context.showMessage("[Fillet] Specify radius");
      this.phase = "specify_radius";
      return TOOL_RESULT_NONE;
    }

    const excludeId = getExcludeId(this.firstSelection.hit);
    let hit = findNearestSegment(context, point, this.getToleranceWorld(context), excludeId);

    if (hit === null && this.firstSelection.hit.kind === "edge") {
      hit = findNearestSegment(context, point, this.getToleranceWorld(context));

      if (hit !== null && hit.kind === "edge" && hit.entity.id === this.firstSelection.hit.entity.id && hit.edgeIndex === this.firstSelection.hit.edgeIndex) {
        hit = null;
      }
    }

    if (hit === null) {
      context.showMessage("[Fillet] Select second line");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Fillet] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const first = this.firstSelection;

    if (first.hit.kind === "edge" && hit.kind === "edge" && first.hit.entity.id === hit.entity.id) {
      return this.executeCornerFillet(first, hit, point, context);
    }

    if (first.hit.kind === "line" && hit.kind === "line") {
      return this.executeLineLineFillet(first, hit, point, context);
    }

    context.showMessage("[Fillet] Select two edges of the same entity or two lines");
    return TOOL_RESULT_NONE;
  }

  private executeLineLineFillet(
    first: FilletSelection,
    secondHit: SegmentHit & { kind: "line" },
    secondPickPoint: Point2D,
    context: ToolContext
  ): ToolResult {
    const firstEntity = (first.hit as { kind: "line"; entity: LineEntity }).entity;
    const secondEntity = secondHit.entity;

    const result = computeLineLineFillet({
      line1: firstEntity,
      line2: secondEntity,
      radius: this.radius ?? 0,
      pickPoint1: first.pickPoint,
      pickPoint2: secondPickPoint,
      tolerance: this.getToleranceWorld(context) * 0.001
    });

    if (!result.ok) {
      context.showMessage(toFilletMessage(result.reason));
      return TOOL_RESULT_NONE;
    }

    const updatedLine1: LineEntity = { ...firstEntity, start: result.line1Result.start, end: result.line1Result.end };
    const updatedLine2: LineEntity = { ...secondEntity, start: result.line2Result.start, end: result.line2Result.end };
    const arcEntity = createArcEntity(firstEntity, secondEntity, result.arc, context);

    const command = new FilletLineLineCommand(firstEntity, secondEntity, updatedLine1, updatedLine2, arcEntity);

    context.executeCommand(command);
    this.resetForNextFillet(context);

    return { type: "command", command };
  }

  private executeCornerFillet(
    first: FilletSelection,
    secondHit: SegmentHit & { kind: "edge" },
    secondPickPoint: Point2D,
    context: ToolContext
  ): ToolResult {
    const entity = (first.hit as { kind: "edge"; entity: RectangleEntity | PolylineEntity; edgeIndex: number }).entity;
    const edgeIndex1 = (first.hit as { kind: "edge"; edgeIndex: number }).edgeIndex;
    const edgeIndex2 = secondHit.edgeIndex;

    const adjacency = areEdgesAdjacent(entity, edgeIndex1, edgeIndex2);

    if (adjacency === null) {
      context.showMessage("[Fillet] Selected edges are not adjacent");
      return TOOL_RESULT_NONE;
    }

    const segments = extractSegments(entity);

    if (segments === null || segments.length < 2) {
      return TOOL_RESULT_NONE;
    }

    const seg1 = segments[adjacency.seg1Index]!;
    const seg2 = segments[adjacency.seg2Index]!;

    const result = computeLineLineFillet({
      line1: { type: "line", start: seg1.start, end: seg1.end },
      line2: { type: "line", start: seg2.start, end: seg2.end },
      radius: this.radius ?? 0,
      pickPoint1: first.pickPoint,
      pickPoint2: secondPickPoint,
      tolerance: this.getToleranceWorld(context) * 0.001
    });

    if (!result.ok) {
      context.showMessage(toFilletMessage(result.reason));
      return TOOL_RESULT_NONE;
    }

    const createdEntities: CadEntity[] = [];
    const layerId = entity.layerId || "layer_0";
    const styleProps = extractStyleProps(entity);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      let start = seg.start;
      let end = seg.end;

      if (i === adjacency.seg1Index) {
        start = result.line1Result.start;
        end = result.line1Result.end;
      } else if (i === adjacency.seg2Index) {
        start = result.line2Result.start;
        end = result.line2Result.end;
      }

      const lineEntity: LineEntity = {
        id: generateId("line_fillet_corner", entity.id, i),
        layerId,
        type: "line",
        start,
        end,
        ...styleProps
      };
      createdEntities.push(lineEntity);
    }

    const arcEntity: ArcEntity = {
      id: generateId("arc_fillet_corner", entity.id, adjacency.cornerIndex),
      layerId,
      type: "arc",
      center: result.arc.center,
      radius: result.arc.radius,
      startAngle: result.arc.startAngle,
      endAngle: result.arc.endAngle,
      clockwise: result.arc.clockwise,
      ...styleProps
    };
    createdEntities.push(arcEntity);

    const command = new FilletCornerCommand(entity, createdEntities);
    context.executeCommand(command);
    this.resetForNextFillet(context);

    return { type: "command", command };
  }

  private resetForNextFillet(context: ToolContext): void {
    this.firstSelection = null;
    this.phase = "select_first_line";
    context.clearPreview();
    context.clearSelection();
    context.showMessage("[Fillet] Select first line");
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

function getSegmentGeometry(hit: SegmentHit): { type: "line"; start: Point2D; end: Point2D } | null {
  if (hit.kind === "line") {
    return { type: "line", start: hit.entity.start, end: hit.entity.end };
  }

  return { type: "line", start: hit.segment.start, end: hit.segment.end };
}

function getExcludeId(hit: SegmentHit): string | undefined {
  return hit.kind === "line" ? hit.entity.id : undefined;
}

function getLayerId(hit: SegmentHit): string {
  return hit.entity.layerId || "layer_0";
}

function extractStyleProps(entity: CadEntity): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  if ("color" in entity && entity.color !== undefined) {
    props.color = entity.color;
  }

  if ("lineThickness" in entity && entity.lineThickness !== undefined) {
    props.lineThickness = entity.lineThickness;
  }

  if ("lineType" in entity && entity.lineType !== undefined) {
    props.lineType = entity.lineType;
  }

  return props;
}

function createArcEntity(
  line1: LineEntity,
  line2: LineEntity,
  arc: Readonly<{ center: Point2D; radius: number; startAngle: number; endAngle: number; clockwise: boolean }>,
  context: ToolContext
): ArcEntity {
  const layerId = line1.layerId === line2.layerId ? line1.layerId : context.document.activeLayerId;
  const entity: ArcEntity = {
    id: generateId("arc_fillet", line1.id, 0),
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

function generateId(prefix: string, entityId: string, index: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${entityId}_${index}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${entityId}_${index}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function toFilletMessage(reason: string): string {
  return reason.toLowerCase().includes("parallel")
    ? "[Fillet] Lines are parallel or invalid"
    : "[Fillet] Radius too large or invalid";
}
