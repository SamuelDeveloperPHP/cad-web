import {
  entityBoundingBox,
  ReplaceEntityCommand,
  TrimLineCommand,
  type CadEntity,
  type LineEntity,
  type SplineEntity
} from "@cad-web/cad-core";
import {
  curveIntersectionParams,
  curveOfEntity,
  curveParamAt,
  entityWithSpan,
  bezierChainIntersectionParams,
  bezierSegmentCount,
  nearestOnBezierChain,
  pathCutDistances,
  subBezierChain,
  trimIntervals,
  pathDistanceAtPoint,
  trimPolylinePath,
  trimLineByPrimitives,
  trimPeriodicCurve,
  type LineParameterSegment,
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
  pathOfEntity,
  newPieceId,
  padBox,
  toBoundaryPrimitives,
  type CurveEntity,
  type EditableEntity,
  type PathEntity
} from "./curveEditUtils";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;

type TrimPhase = "selecting_cutting_edges" | "trimming_segments";

// Resultado calculado de um trim (usado tanto no preview quanto na confirmação).
type TrimPlan = Readonly<{
  command: ReplaceEntityCommand | TrimLineCommand;
  removedPreview: CadEntity;
}>;

/**
 * Ferramenta Trim: apara linhas, círculos, arcos, elipses e arcos de elipse. Qualquer entidade com
 * geometria (linha, retângulo, polyline, círculo, arco, elipse, arco de elipse) serve de aresta de corte.
 * Um círculo ou elipse fechada precisa de dois cortes e vira arco; um arco pode virar dois arcos.
 */
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

    const hit = findNearestEditable(context, event.worldPoint, this.getToleranceWorld(context), isTrimmable);

    if (hit === null || hit.locked) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const plan = this.planTrim(hit.entity, event.worldPoint, context);

    if (typeof plan === "string") {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const preview = { type: "ghostEntities" as const, entities: [plan.removedPreview] };
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

    if (entity === undefined || !hasIntersectGeometry(entity)) {
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
    context.showMessage("[Trim] Select object to trim");

    return TOOL_RESULT_NONE;
  }

  private trimPickedSegment(point: Point2D, context: ToolContext): ToolResult {
    const hit = findNearestEditable(context, point, this.getToleranceWorld(context), isTrimmable);

    if (hit === null) {
      context.showMessage("[Trim] Select object to trim");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Trim] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const plan = this.planTrim(hit.entity, point, context);

    if (typeof plan === "string") {
      context.clearPreview();
      context.showMessage(plan);
      return TOOL_RESULT_NONE;
    }

    context.executeCommand(plan.command);
    context.clearPreview();
    context.showMessage("[Trim] Trimmed. Select another object or press Esc");

    return { type: "command", command: plan.command };
  }

  // Calcula o trim do objeto no ponto clicado; devolve a mensagem de aviso quando não há o que aparar.
  private planTrim(target: EditableEntity, point: Point2D, context: ToolContext): TrimPlan | string {
    const tolerance = this.getToleranceWorld(context);
    const cutters = collectBoundaryEntities(
      context,
      this.cuttingEdgeIds,
      this.useAllVisibleCuttingEdges,
      padBox(entityBoundingBox(target), tolerance),
      target.id
    );
    const primitives = toBoundaryPrimitives(cutters).map((boundary) => boundary.primitive);

    if (target.type === "line") {
      const result = trimLineByPrimitives(target, primitives, point, tolerance);

      if (result.removedSegment === null) {
        return result.cutParameters.length === 0 ? "[Trim] No valid cutting edge found" : "[Trim] No trim segment found at the picked point";
      }

      const pieces = result.resultLines.map((segment, index) => lineFromSegment(target, segment, index === 0 ? target.id : newPieceId(target.id, "trim")));
      return {
        command: new TrimLineCommand(target, pieces),
        removedPreview: lineFromSegment(target, result.removedSegment, `trim_preview_${target.id}`)
      };
    }

    if (isPathEntity(target)) {
      return planPathTrim(target, primitives, point);
    }

    if (target.type === "spline") {
      return planSplineTrim(target, primitives, point);
    }

    return planCurveTrim(target, primitives, point);
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

function planCurveTrim(
  target: CurveEntity,
  primitives: Parameters<typeof curveIntersectionParams>[1],
  point: Point2D
): TrimPlan | string {
  const { curve, span } = curveOfEntity(target);
  const cuts = curveIntersectionParams(curve, primitives);
  const result = trimPeriodicCurve(span, cuts, curveParamAt(curve, point));

  if (result === null) {
    return span === null && cuts.length === 1
      ? "[Trim] A closed curve needs two cutting points"
      : "[Trim] No valid cutting edge found";
  }

  const pieces = result.kept.map((piece, index) =>
    ({ ...entityWithSpan(target, piece), id: index === 0 ? target.id : newPieceId(target.id, "trim") }) as CadEntity
  );

  return {
    command: new ReplaceEntityCommand(target, pieces, "Trims a curve."),
    removedPreview: { ...entityWithSpan(target, result.removed), id: `trim_preview_${target.id}` } as CadEntity
  };
}

/**
 * Trim de retângulo ou polyline por trecho: o caminho é cortado nas interseções e o trecho clicado sai.
 * O retângulo e a polyline fechada viram polyline aberta (dois cortes necessários); a polyline aberta
 * pode virar duas. Estilo, camada e id (no primeiro pedaço) são preservados.
 */
function planPathTrim(
  target: PathEntity,
  primitives: Parameters<typeof pathCutDistances>[2],
  point: Point2D
): TrimPlan | string {
  const { points, closed } = pathOfEntity(target);
  const cuts = pathCutDistances(points, closed, primitives);
  const result = trimPolylinePath(points, closed, cuts, pathDistanceAtPoint(points, closed, point));

  if (result === null) {
    return closed && cuts.length === 1 ? "[Trim] A closed shape needs two cutting points" : "[Trim] No valid cutting edge found";
  }

  const { id: _id, type: _type, ...shared } = styleAndLayer(target);
  const pieces = result.kept
    .filter((piece) => piece.length >= 2)
    .map((piece, index) => ({
      ...shared,
      id: index === 0 ? target.id : newPieceId(target.id, "trim"),
      type: "polyline",
      points: piece,
      closed: false
    }) as CadEntity);

  return {
    command: new ReplaceEntityCommand(target, pieces, "Trims a polyline."),
    removedPreview: { ...shared, id: `trim_preview_${target.id}`, type: "polyline", points: result.removed, closed: false } as CadEntity
  };
}

// Campos comuns (id, tipo, camada, cor, tipo e espessura de linha) de uma entidade de caminho.
function styleAndLayer(entity: PathEntity): Record<string, unknown> {
  const { id, type, layerId, color, lineType, lineThickness } = entity;
  return {
    id,
    type,
    layerId,
    ...(color !== undefined ? { color } : {}),
    ...(lineType !== undefined ? { lineType } : {}),
    ...(lineThickness !== undefined ? { lineThickness } : {})
  };
}

/**
 * Trim de spline: os cortes são parâmetros da cadeia de Béziers (interseções refinadas na curva) e os
 * pedaços mantidos são sub-cadeias exatas. A spline aparada fica só com pontos de controle, como no AutoCAD.
 */
function planSplineTrim(
  target: SplineEntity,
  primitives: Parameters<typeof bezierChainIntersectionParams>[1][],
  point: Point2D
): TrimPlan | string {
  const chain = target.controlPoints;
  const total = bezierSegmentCount(chain);
  const raw = primitives.flatMap((primitive) => bezierChainIntersectionParams(chain, primitive));
  const cuts = uniqueParams(raw, total, target.closed);
  const intervals = trimIntervals(total, target.closed, cuts, nearestOnBezierChain(chain, point).u);

  if (intervals === null) {
    return target.closed && cuts.length === 1 ? "[Trim] A closed spline needs two cutting points" : "[Trim] No valid cutting edge found";
  }

  const piece = ([from, to]: readonly [number, number]) =>
    from <= to ? subBezierChain(chain, from, to) : [...subBezierChain(chain, from, total), ...subBezierChain(chain, 0, to).slice(1)];
  const { fitPoints: _fit, ...base } = target;
  const pieces = intervals.kept
    .map(piece)
    .filter((controlPoints) => controlPoints.length >= 4)
    .map((controlPoints, index) => ({ ...base, id: index === 0 ? target.id : newPieceId(target.id, "trim"), controlPoints, closed: false }) as CadEntity);

  return {
    command: new ReplaceEntityCommand(target, pieces, "Trims a spline."),
    removedPreview: { ...base, id: `trim_preview_${target.id}`, controlPoints: piece(intervals.removed), closed: false } as CadEntity
  };
}

// Parâmetros de corte ordenados e sem repetição; no domínio aberto as pontas não contam, no fechado 0 ≡ total.
function uniqueParams(params: ReadonlyArray<number>, total: number, closed: boolean): number[] {
  const normalized = params
    .map((u) => (closed && u >= total - 1e-9 ? 0 : u))
    .filter((u) => closed || (u > 1e-9 && u < total - 1e-9))
    .sort((a, b) => a - b);
  const unique: number[] = [];
  for (const u of normalized) if (unique.length === 0 || u - unique[unique.length - 1]! > 1e-9) unique.push(u);
  return unique;
}

function isTrimmable(entity: CadEntity): entity is EditableEntity {
  return entity.type === "line" || isCurveEntity(entity) || isPathEntity(entity) || entity.type === "spline";
}

function lineFromSegment(original: LineEntity, segment: LineParameterSegment, id: string): LineEntity {
  return { ...original, id, start: segment.start, end: segment.end };
}
