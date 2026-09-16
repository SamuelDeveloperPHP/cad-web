import {
  ChamferCornerCommand,
  ChamferLineLineCommand,
  type CadEntity,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
} from "@cad-web/cad-core";
import { computeLineLineChamfer, type Point2D } from "@cad-web/cad-geometry";
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

type ChamferPhase =
  | "specify_distance1"
  | "specify_distance2"
  | "select_first_line"
  | "select_second_line";

type ChamferSelection = Readonly<{
  hit: SegmentHit;
  pickPoint: Point2D;
}>;

type ParsedDistanceInput =
  | Readonly<{ kind: "single"; value: number }>
  | Readonly<{ kind: "pair"; value1: number; value2: number }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "invalid" }>;

export class ChamferTool implements CadTool {
  readonly id = "chamfer";
  readonly name = "Chamfer";
  readonly aliases = ["cha", "chamfer"];

  private phase: ChamferPhase = "specify_distance1";
  private distance1: number | null = null;
  private distance2: number | null = null;
  private firstSelection: ChamferSelection | null = null;

  activate(context: ToolContext): void {
    this.firstSelection = null;
    context.clearPreview();
    context.clearSelection();

    if (this.distance1 === null || this.distance2 === null) {
      this.phase = "specify_distance1";
      context.requestNumericInput({ prompt: "[Chamfer] Specify first distance", min: 0 });
      context.showMessage("[Chamfer] Specify first distance");
      return;
    }

    this.phase = "select_first_line";
    context.showMessage("[Chamfer] Select first line");
  }

  deactivate(context: ToolContext): void {
    this.firstSelection = null;
    context.clearPreview();
    context.clearSelection();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary") {
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "specify_distance1" || this.phase === "specify_distance2") {
      context.showMessage(this.currentDistancePrompt());
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "select_first_line") {
      return this.selectFirstSegment(event.worldPoint, context);
    }

    return this.selectSecondSegment(event.worldPoint, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.phase !== "select_second_line" || this.firstSelection === null) {
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

    const chamferResult = computeLineLineChamfer({
      line1: seg1,
      line2: seg2,
      distance1: this.distance1 ?? 0,
      distance2: this.distance2 ?? 0,
      pickPoint1: this.firstSelection.pickPoint,
      pickPoint2: event.worldPoint,
      tolerance: this.getToleranceWorld(context) * 0.001
    });

    if (!chamferResult.ok) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const layerId = getLayerId(this.firstSelection.hit);

    const preview = {
      type: "ghostEntities" as const,
      entities: [
        { id: "chamfer_preview_l1", layerId, type: "line" as const, start: chamferResult.line1Result.start, end: chamferResult.line1Result.end },
        { id: "chamfer_preview_l2", layerId: getLayerId(hit), type: "line" as const, start: chamferResult.line2Result.start, end: chamferResult.line2Result.end },
        { id: "chamfer_preview_cl", layerId, type: "line" as const, start: chamferResult.chamferLine.start, end: chamferResult.chamferLine.end }
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
      context.showMessage("[Chamfer] Select first line");
      return { type: "cancel" };
    }

    this.firstSelection = null;
    this.phase = this.distance1 === null || this.distance2 === null ? "specify_distance1" : "select_first_line";
    context.clearPreview();
    context.clearSelection();
    context.showMessage("[Chamfer] Cancelled");

    return { type: "cancel" };
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    // As distâncias são digitadas na unidade de trabalho; a escala converte para a base (mm) num único ponto.
    const parsed = scaleChamferDistances(parseChamferDistanceInput(input), context.unitScale);

    if (this.phase === "specify_distance1") {
      return this.handleDistance1Input(parsed, context);
    }

    if (this.phase === "specify_distance2") {
      return this.handleDistance2Input(parsed, context);
    }

    if (parsed.kind === "pair") {
      this.distance1 = parsed.value1;
      this.distance2 = parsed.value2;
      this.firstSelection = null;
      this.phase = "select_first_line";
      context.clearPreview();
      context.clearSelection();
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    if (parsed.kind === "single") {
      this.distance1 = parsed.value;
      this.distance2 = parsed.value;
      this.firstSelection = null;
      this.phase = "select_first_line";
      context.clearPreview();
      context.clearSelection();
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    return TOOL_RESULT_NONE;
  }

  private handleDistance1Input(parsed: ParsedDistanceInput, context: ToolContext): ToolResult {
    if (parsed.kind === "pair") {
      this.distance1 = parsed.value1;
      this.distance2 = parsed.value2;
      this.firstSelection = null;
      this.phase = "select_first_line";
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    if (parsed.kind === "single") {
      this.distance1 = parsed.value;
      this.distance2 = parsed.value;
      this.firstSelection = null;
      this.phase = "select_first_line";
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    context.showMessage("[Chamfer] Distances are invalid");
    return { type: "error", message: "[Chamfer] Distances are invalid" };
  }

  private handleDistance2Input(parsed: ParsedDistanceInput, context: ToolContext): ToolResult {
    if (parsed.kind === "empty") {
      this.distance2 = this.distance1;
      this.phase = "select_first_line";
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    if (parsed.kind === "single") {
      this.distance2 = parsed.value;
      this.phase = "select_first_line";
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    if (parsed.kind === "pair") {
      this.distance1 = parsed.value1;
      this.distance2 = parsed.value2;
      this.phase = "select_first_line";
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    context.showMessage("[Chamfer] Distances are invalid");
    return { type: "error", message: "[Chamfer] Distances are invalid" };
  }

  private currentDistancePrompt(): string {
    return this.phase === "specify_distance1"
      ? "[Chamfer] Specify first distance"
      : "[Chamfer] Specify second distance or press Enter to use same";
  }

  private selectFirstSegment(point: Point2D, context: ToolContext): ToolResult {
    const hit = findNearestSegment(context, point, this.getToleranceWorld(context));

    if (hit === null) {
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Chamfer] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    this.firstSelection = { hit, pickPoint: point };
    this.phase = "select_second_line";
    context.selectEntities([hit.entity.id]);
    context.showMessage("[Chamfer] Select second line");

    return TOOL_RESULT_NONE;
  }

  private selectSecondSegment(point: Point2D, context: ToolContext): ToolResult {
    if (this.distance1 === null || this.distance2 === null || this.firstSelection === null) {
      context.showMessage("[Chamfer] Specify first distance");
      this.phase = "specify_distance1";
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
      context.showMessage("[Chamfer] Select second line");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Chamfer] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const first = this.firstSelection;

    if (first.hit.kind === "edge" && hit.kind === "edge" && first.hit.entity.id === hit.entity.id) {
      return this.executeCornerChamfer(first, hit, point, context);
    }

    if (first.hit.kind === "line" && hit.kind === "line") {
      return this.executeLineLineChamfer(first, hit, point, context);
    }

    context.showMessage("[Chamfer] Select two edges of the same entity or two lines");
    return TOOL_RESULT_NONE;
  }

  private executeLineLineChamfer(
    first: ChamferSelection,
    secondHit: SegmentHit & { kind: "line" },
    secondPickPoint: Point2D,
    context: ToolContext
  ): ToolResult {
    const firstEntity = (first.hit as { kind: "line"; entity: LineEntity }).entity;
    const secondEntity = secondHit.entity;

    const result = computeLineLineChamfer({
      line1: firstEntity,
      line2: secondEntity,
      distance1: this.distance1 ?? 0,
      distance2: this.distance2 ?? 0,
      pickPoint1: first.pickPoint,
      pickPoint2: secondPickPoint,
      tolerance: this.getToleranceWorld(context) * 0.001
    });

    if (!result.ok) {
      context.showMessage(toChamferMessage(result.reason));
      return TOOL_RESULT_NONE;
    }

    const updatedLine1: LineEntity = { ...firstEntity, start: result.line1Result.start, end: result.line1Result.end };
    const updatedLine2: LineEntity = { ...secondEntity, start: result.line2Result.start, end: result.line2Result.end };
    const chamferLine = createChamferLineEntity(firstEntity, secondEntity, result.chamferLine.start, result.chamferLine.end, context);

    const command = new ChamferLineLineCommand(firstEntity, secondEntity, updatedLine1, updatedLine2, chamferLine);
    context.executeCommand(command);
    this.resetForNextChamfer(context);

    return { type: "command", command };
  }

  private executeCornerChamfer(
    first: ChamferSelection,
    secondHit: SegmentHit & { kind: "edge" },
    secondPickPoint: Point2D,
    context: ToolContext
  ): ToolResult {
    const entity = (first.hit as { kind: "edge"; entity: RectangleEntity | PolylineEntity; edgeIndex: number }).entity;
    const edgeIndex1 = (first.hit as { kind: "edge"; edgeIndex: number }).edgeIndex;
    const edgeIndex2 = secondHit.edgeIndex;

    const adjacency = areEdgesAdjacent(entity, edgeIndex1, edgeIndex2);

    if (adjacency === null) {
      context.showMessage("[Chamfer] Selected edges are not adjacent");
      return TOOL_RESULT_NONE;
    }

    const segments = extractSegments(entity);

    if (segments === null || segments.length < 2) {
      return TOOL_RESULT_NONE;
    }

    const seg1 = segments[adjacency.seg1Index]!;
    const seg2 = segments[adjacency.seg2Index]!;

    const result = computeLineLineChamfer({
      line1: { type: "line", start: seg1.start, end: seg1.end },
      line2: { type: "line", start: seg2.start, end: seg2.end },
      distance1: this.distance1 ?? 0,
      distance2: this.distance2 ?? 0,
      pickPoint1: first.pickPoint,
      pickPoint2: secondPickPoint,
      tolerance: this.getToleranceWorld(context) * 0.001
    });

    if (!result.ok) {
      context.showMessage(toChamferMessage(result.reason));
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
        id: generateId("line_chamfer_corner", entity.id, i),
        layerId,
        type: "line",
        start,
        end,
        ...styleProps
      };
      createdEntities.push(lineEntity);
    }

    const chamferLineEntity: LineEntity = {
      id: generateId("line_chamfer_corner", entity.id, segments.length),
      layerId,
      type: "line",
      start: result.chamferLine.start,
      end: result.chamferLine.end,
      ...styleProps
    };
    createdEntities.push(chamferLineEntity);

    const command = new ChamferCornerCommand(entity, createdEntities);
    context.executeCommand(command);
    this.resetForNextChamfer(context);

    return { type: "command", command };
  }

  private resetForNextChamfer(context: ToolContext): void {
    this.firstSelection = null;
    this.phase = "select_first_line";
    context.clearPreview();
    context.clearSelection();
    context.showMessage("[Chamfer] Select first line");
  }

  private getToleranceWorld(context: ToolContext): number {
    return DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale;
  }
}

// A função converte as distâncias digitadas (unidade de trabalho) para a base (mm); empty/invalid passam intactos.
function scaleChamferDistances(parsed: ParsedDistanceInput, unitScale: number): ParsedDistanceInput {
  if (parsed.kind === "single") {
    return { kind: "single", value: parsed.value * unitScale };
  }

  if (parsed.kind === "pair") {
    return { kind: "pair", value1: parsed.value1 * unitScale, value2: parsed.value2 * unitScale };
  }

  return parsed;
}

export function parseChamferDistanceInput(rawInput: string): ParsedDistanceInput {
  const trimmedInput = rawInput.trim();

  if (trimmedInput.length === 0) {
    return { kind: "empty" };
  }

  const lowercased = trimmedInput.toLowerCase();
  const namedPair = parseNamedPair(lowercased);

  if (namedPair !== null) {
    return namedPair;
  }

  const separatorPair = parseSeparatorPair(lowercased);

  if (separatorPair !== null) {
    return separatorPair;
  }

  const singleMatch = lowercased.match(/^(?:d|dist|distance|distancia|d1|distance1|distancia1)?\s*=?\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);

  if (singleMatch !== null && singleMatch[1] !== undefined) {
    const value = Number(singleMatch[1]);

    if (Number.isFinite(value) && value > 0) {
      return { kind: "single", value };
    }
  }

  return { kind: "invalid" };
}

function parseSeparatorPair(input: string): ParsedDistanceInput | null {
  const match = input.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[,x]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);

  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }

  const value1 = Number(match[1]);
  const value2 = Number(match[2]);

  if (!Number.isFinite(value1) || !Number.isFinite(value2) || value1 <= 0 || value2 <= 0) {
    return { kind: "invalid" };
  }

  return { kind: "pair", value1, value2 };
}

function parseNamedPair(input: string): ParsedDistanceInput | null {
  const tokens = input.split(/\s+/).filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  let value1: number | null = null;
  let value2: number | null = null;
  let hasNamedToken = false;

  for (const token of tokens) {
    const namedMatch = token.match(/^(d1|d2|distance1|distance2|distancia1|distancia2)=([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);

    if (namedMatch === null || namedMatch[1] === undefined || namedMatch[2] === undefined) {
      return null;
    }

    hasNamedToken = true;
    const value = Number(namedMatch[2]);
    const key = namedMatch[1].toLowerCase();

    if (key === "d1" || key === "distance1" || key === "distancia1") {
      value1 = value;
    } else {
      value2 = value;
    }
  }

  if (!hasNamedToken) {
    return null;
  }

  if (value1 === null && value2 === null) {
    return { kind: "invalid" };
  }

  if (value1 !== null && value2 === null) {
    if (!Number.isFinite(value1) || value1 <= 0) {
      return { kind: "invalid" };
    }

    return { kind: "single", value: value1 };
  }

  if (value1 === null && value2 !== null) {
    if (!Number.isFinite(value2) || value2 <= 0) {
      return { kind: "invalid" };
    }

    return { kind: "single", value: value2 };
  }

  if (value1 !== null && value2 !== null) {
    if (!Number.isFinite(value1) || !Number.isFinite(value2) || value1 <= 0 || value2 <= 0) {
      return { kind: "invalid" };
    }

    return { kind: "pair", value1, value2 };
  }

  return { kind: "invalid" };
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

function createChamferLineEntity(
  line1: LineEntity,
  line2: LineEntity,
  start: Point2D,
  end: Point2D,
  context: ToolContext
): LineEntity {
  const layerId = line1.layerId === line2.layerId ? line1.layerId : context.document.activeLayerId;
  const baseEntity: LineEntity = {
    id: generateId("line_chamfer", line1.id, 0),
    layerId,
    type: "line",
    start,
    end
  };

  return {
    ...baseEntity,
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

function toChamferMessage(reason: string): string {
  const lowered = reason.toLowerCase();

  if (lowered.includes("parallel")) {
    return "[Chamfer] Lines are parallel or invalid";
  }

  if (lowered.includes("distance")) {
    return "[Chamfer] Distances are invalid";
  }

  return "[Chamfer] Lines are parallel or invalid";
}
