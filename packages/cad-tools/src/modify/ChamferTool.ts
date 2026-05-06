import {
  ChamferLineLineCommand,
  getDocumentSpatialIndex,
  type CadEntity,
  type LineEntity
} from "@cad-web/cad-core";
import { computeLineLineChamfer, distancePointToSegment, type Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;

type ChamferPhase =
  | "specify_distance1"
  | "specify_distance2"
  | "select_first_line"
  | "select_second_line";

type LineHit = Readonly<{
  entity: LineEntity;
  locked: boolean;
}>;

type ChamferSelection = Readonly<{
  entity: LineEntity;
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
    // O metodo reinicia apenas o estado interativo e preserva as distancias entre execucoes.
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
    // O metodo limpa preview e selecao, mas mantem as distancias para reativacoes futuras.
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
      return this.selectFirstLine(event.worldPoint, context);
    }

    return this.selectSecondLine(event.worldPoint, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.phase !== "select_second_line" || this.firstSelection === null) {
      return TOOL_RESULT_NONE;
    }

    const hit = findNearestLine(context, event.worldPoint, this.getToleranceWorld(context), this.firstSelection.entity.id);

    if (hit === null || hit.locked) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const previewEntities = this.buildChamferEntities(this.firstSelection, hit.entity, event.worldPoint, context, true);

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
      // O Esc limpa a primeira linha e retorna o usuario para a fase inicial de selecao.
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
    const parsed = parseChamferDistanceInput(input);

    if (this.phase === "specify_distance1") {
      return this.handleDistance1Input(parsed, context);
    }

    if (this.phase === "specify_distance2") {
      return this.handleDistance2Input(parsed, context);
    }

    // O metodo permite redefinir as distancias durante a selecao das linhas.
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
      // O valor unico aplica a mesma distancia para ambas as linhas, replicando o atalho do AutoCAD.
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

  private selectFirstLine(point: Point2D, context: ToolContext): ToolResult {
    const hit = findNearestLine(context, point, this.getToleranceWorld(context));

    if (hit === null) {
      context.showMessage("[Chamfer] Select first line");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Chamfer] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    this.firstSelection = {
      entity: hit.entity,
      pickPoint: point
    };
    this.phase = "select_second_line";
    context.selectEntities([hit.entity.id]);
    context.showMessage("[Chamfer] Select second line");

    return TOOL_RESULT_NONE;
  }

  private selectSecondLine(point: Point2D, context: ToolContext): ToolResult {
    if (this.distance1 === null || this.distance2 === null || this.firstSelection === null) {
      context.showMessage("[Chamfer] Specify first distance");
      this.phase = "specify_distance1";
      return TOOL_RESULT_NONE;
    }

    const hit = findNearestLine(context, point, this.getToleranceWorld(context), this.firstSelection.entity.id);

    if (hit === null) {
      context.showMessage("[Chamfer] Select second line");
      return TOOL_RESULT_NONE;
    }

    if (hit.locked) {
      context.showMessage("[Chamfer] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const chamferEntities = this.buildChamferEntities(this.firstSelection, hit.entity, point, context, false);

    if (chamferEntities === null) {
      return TOOL_RESULT_NONE;
    }

    const [updatedLine1, updatedLine2, chamferLine] = chamferEntities;
    const command = new ChamferLineLineCommand(this.firstSelection.entity, hit.entity, updatedLine1, updatedLine2, chamferLine);

    context.executeCommand(command);
    this.firstSelection = null;
    this.phase = "select_first_line";
    context.clearPreview();
    context.clearSelection();
    context.showMessage("[Chamfer] Select first line");

    return { type: "command", command };
  }

  private buildChamferEntities(
    firstSelection: ChamferSelection,
    secondLine: LineEntity,
    secondPickPoint: Point2D,
    context: ToolContext,
    preview: boolean
  ): [LineEntity, LineEntity, LineEntity] | null {
    if (this.distance1 === null || this.distance2 === null) {
      return null;
    }

    const result = computeLineLineChamfer({
      line1: firstSelection.entity,
      line2: secondLine,
      distance1: this.distance1,
      distance2: this.distance2,
      pickPoint1: firstSelection.pickPoint,
      pickPoint2: secondPickPoint,
      tolerance: this.getToleranceWorld(context) * 0.001
    });

    if (!result.ok) {
      context.showMessage(toChamferMessage(result.reason));
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
    const chamferLine = createChamferLineEntity(
      firstSelection.entity,
      secondLine,
      result.chamferLine.start,
      result.chamferLine.end,
      context,
      preview
    );

    return [updatedLine1, updatedLine2, chamferLine];
  }

  private getToleranceWorld(context: ToolContext): number {
    return DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale;
  }
}

export function parseChamferDistanceInput(rawInput: string): ParsedDistanceInput {
  // O parser aceita distancia unica, par com separador ou par com chaves nomeadas.
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
  // O metodo aceita pares simples como "10,5" ou "10x5".
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
  // O metodo aceita pares nomeados como "d1=10 d2=5" ou "distancia1=10 distancia2=5".
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
      // O parser exige que cada token seja nomeado para confirmar o formato par.
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

function createChamferLineEntity(
  line1: LineEntity,
  line2: LineEntity,
  start: Point2D,
  end: Point2D,
  context: ToolContext,
  preview: boolean
): LineEntity {
  // O metodo herda layer e estilo das linhas originais sempre que coincidem.
  const layerId = line1.layerId === line2.layerId ? line1.layerId : context.document.activeLayerId;
  const baseEntity: LineEntity = {
    id: preview ? `chamfer_preview_${line1.id}_${line2.id}` : createChamferLineId(line1.id, line2.id),
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

function createChamferLineId(line1Id: string, line2Id: string): string {
  // O metodo gera identificadores unicos para a linha do chanfro mesmo em ambientes sem crypto.randomUUID.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `line_chamfer_${line1Id}_${line2Id}_${crypto.randomUUID()}`;
  }

  return `line_chamfer_${line1Id}_${line2Id}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function findNearestLine(
  context: ToolContext,
  point: Point2D,
  toleranceWorld: number,
  excludedEntityId?: string
): LineHit | null {
  // O metodo consulta o spatial index para evitar percorrer todas as entidades do documento.
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

function toChamferMessage(reason: string): string {
  // O mapeamento traduz a razao geometrica para a mensagem amigavel da linha de comando.
  const lowered = reason.toLowerCase();

  if (lowered.includes("parallel")) {
    return "[Chamfer] Lines are parallel or invalid";
  }

  if (lowered.includes("distance")) {
    return "[Chamfer] Distances are invalid";
  }

  return "[Chamfer] Lines are parallel or invalid";
}

function isLayerVisible(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));

  return layer?.visible !== false;
}

function isLayerLocked(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));

  return layer?.locked === true;
}
