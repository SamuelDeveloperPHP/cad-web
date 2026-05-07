import {
  ArrayEntitiesCommand,
  buildPathArrayEntities,
  estimatePathArrayEntityCount,
  transformEntityForPathArray,
  type CadEntity,
  type EntityId
} from "@cad-web/cad-core";
import {
  ensurePathSource,
  getPolylineTransformAtSample,
  samplePathByCount,
  validatePathArrayParams,
  type PathArrayParams,
  type PathSample,
  type PathSource,
  type Point2D
} from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { findNearestEntityId } from "../selection/hitTesting";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

// O modulo descreve a ferramenta Path Array, que distribui copias das entidades selecionadas ao longo de uma PolylineEntity.
// O fluxo segue o padrao das demais ferramentas: maquina de estados, preview ghost e geracao de comando apenas na confirmacao.

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;
const PREVIEW_ENTITY_BUDGET = 2_000;
const LARGE_ARRAY_WARNING_THRESHOLD = 10_000;
const HUGE_ARRAY_WARNING_THRESHOLD = 50_000;

type PathArrayPhase =
  | "selecting_objects"
  | "specify_base_point"
  | "select_path"
  | "specify_count"
  | "confirm_align"
  | "confirm_array";

type PathArrayWorkingParams = Readonly<{
  basePoint: Point2D | null;
  pathEntityId: EntityId | null;
  count: number | null;
  alignToTangent: boolean;
}>;

const EMPTY_PATH_PARAMS: PathArrayWorkingParams = {
  basePoint: null,
  pathEntityId: null,
  count: null,
  alignToTangent: true
};

export class PathArrayTool implements CadTool {
  readonly id = "arrayPath";
  readonly name = "Path Array";
  readonly aliases = ["ap", "arraypath", "patharray", "matrizcaminho", "matrizporcaminho"];

  private phase: PathArrayPhase = "selecting_objects";
  private params: PathArrayWorkingParams = EMPTY_PATH_PARAMS;
  private confirmedSelection: ReadonlyArray<EntityId> = [];
  private hugeArrayAcknowledged = false;

  activate(context: ToolContext): void {
    // O metodo respeita uma selecao previa, sem incluir polylines que possam virar path mais tarde.
    this.params = EMPTY_PATH_PARAMS;
    this.confirmedSelection = [];
    this.hugeArrayAcknowledged = false;
    context.clearPreview();

    if (context.selection.entityIds.length > 0) {
      this.confirmedSelection = filterSelectableIds(context, context.selection.entityIds);

      if (this.confirmedSelection.length > 0) {
        this.phase = "specify_base_point";
        context.showMessage("[PathArray] Specify base point");
        return;
      }
    }

    this.phase = "selecting_objects";
    context.showMessage("[PathArray] Select objects");
  }

  deactivate(context: ToolContext): void {
    this.params = EMPTY_PATH_PARAMS;
    this.confirmedSelection = [];
    this.hugeArrayAcknowledged = false;
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary") {
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "selecting_objects") {
      return this.toggleEntityAtPoint(event.worldPoint, context);
    }

    if (this.phase === "specify_base_point") {
      const basePoint = resolveSnappedPoint(event, context);
      this.params = { ...this.params, basePoint };
      this.advancePhaseFromParams(context);
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "select_path") {
      return this.handlePathClick(event.worldPoint, context);
    }

    // O ponteiro nao avanca a ferramenta enquanto faltam parametros numericos.
    context.showMessage(this.currentPrompt());
    return TOOL_RESULT_NONE;
  }

  onPointerMove(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    // O preview e disparado apenas apos count e align estarem definidos.
    return TOOL_RESULT_NONE;
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      return this.handleEscape(context);
    }

    if (event.key === "Enter") {
      return this.handleEnter(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const trimmed = input.trim();

    if (trimmed.length === 0) {
      return this.handleEnter(context);
    }

    if (this.phase === "selecting_objects") {
      context.showMessage("[PathArray] Select objects");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "specify_base_point") {
      const point = parsePointInput(trimmed);

      if (point === null) {
        context.showMessage("[PathArray] Specify base point");
        return { type: "error", message: "[PathArray] Specify base point" };
      }

      this.params = { ...this.params, basePoint: point };
      this.advancePhaseFromParams(context);
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "specify_count") {
      const count = parseCountInput(trimmed);

      if (count === null) {
        context.showMessage("[PathArray] Invalid count");
        return { type: "error", message: "[PathArray] Invalid count" };
      }

      this.params = { ...this.params, count };
      this.advancePhaseFromParams(context);
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "confirm_align") {
      return this.applyAlignInput(trimmed, context);
    }

    if (this.phase === "confirm_array") {
      return this.applyConfirmationInput(trimmed, context);
    }

    return TOOL_RESULT_NONE;
  }

  private handleEnter(context: ToolContext): ToolResult {
    if (this.phase === "selecting_objects") {
      const filtered = filterSelectableIds(context, context.selection.entityIds);

      if (filtered.length === 0) {
        context.showMessage("[PathArray] Select objects");
        return TOOL_RESULT_NONE;
      }

      this.confirmedSelection = filtered;
      this.phase = "specify_base_point";
      context.showMessage("[PathArray] Specify base point");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "confirm_align") {
      // O Enter sem texto aceita o default Yes para alinhamento a tangente.
      this.params = { ...this.params, alignToTangent: true };
      this.advancePhaseFromParams(context);
      this.refreshPreview(context);
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "confirm_array") {
      return this.commitArray(context);
    }

    context.showMessage(this.currentPrompt());
    return TOOL_RESULT_NONE;
  }

  private handleEscape(context: ToolContext): ToolResult {
    if (this.phase === "specify_base_point") {
      this.confirmedSelection = [];
      this.phase = "selecting_objects";
      context.showMessage("[PathArray] Select objects");
      return { type: "cancel" };
    }

    if (this.phase === "select_path") {
      this.params = { ...this.params, basePoint: null };
      this.phase = "specify_base_point";
      context.showMessage("[PathArray] Specify base point");
      return { type: "cancel" };
    }

    if (this.phase === "specify_count") {
      this.params = { ...this.params, pathEntityId: null };
      this.phase = "select_path";
      context.showMessage("[PathArray] Select path entity");
      return { type: "cancel" };
    }

    if (this.phase === "confirm_align") {
      this.params = { ...this.params, count: null };
      this.phase = "specify_count";
      context.showMessage("[PathArray] Specify item count");
      return { type: "cancel" };
    }

    if (this.phase === "confirm_array") {
      this.hugeArrayAcknowledged = false;
      this.phase = "confirm_align";
      context.clearPreview();
      context.showMessage("[PathArray] Align items to path? Yes/No <Yes>");
      return { type: "cancel" };
    }

    this.deactivate(context);
    context.showMessage("[PathArray] Cancelled");
    return { type: "cancel" };
  }

  private toggleEntityAtPoint(point: Point2D, context: ToolContext): ToolResult {
    const toleranceWorld = DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale;
    const entityId = findNearestEntityId(context.document, { worldPoint: point, toleranceWorld });

    if (entityId === null) {
      return TOOL_RESULT_NONE;
    }

    const entity = context.document.entities.find((candidate) => candidate.id === entityId);

    if (entity === undefined) {
      return TOOL_RESULT_NONE;
    }

    if (isLayerLocked(context, entity)) {
      context.showMessage("[PathArray] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const currentIds = new Set(context.selection.entityIds);

    if (currentIds.has(entityId)) {
      currentIds.delete(entityId);
    } else {
      currentIds.add(entityId);
    }

    context.selectEntities(Array.from(currentIds));
    return TOOL_RESULT_NONE;
  }

  private handlePathClick(point: Point2D, context: ToolContext): ToolResult {
    // O metodo aceita polyline, line, circle ou arc como path; demais tipos sao rejeitados com mensagem clara.
    const toleranceWorld = DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale;
    const entityId = findNearestEntityId(context.document, { worldPoint: point, toleranceWorld });

    if (entityId === null) {
      context.showMessage("[PathArray] Select path entity");
      return TOOL_RESULT_NONE;
    }

    const entity = context.document.entities.find((candidate) => candidate.id === entityId);

    if (entity === undefined || !isSupportedPathEntity(entity)) {
      context.showMessage("[PathArray] Select path entity");
      return TOOL_RESULT_NONE;
    }

    // O agente remove o path da lista de sources caso ele tenha sido selecionado por engano.
    this.confirmedSelection = this.confirmedSelection.filter((id) => id !== entity.id);
    this.params = { ...this.params, pathEntityId: entity.id };
    this.advancePhaseFromParams(context);

    if (this.confirmedSelection.length === 0) {
      // O fluxo retorna para selecao quando o usuario removeu acidentalmente todas as sources.
      this.phase = "selecting_objects";
      context.showMessage("[PathArray] Select objects");
    }

    return TOOL_RESULT_NONE;
  }

  private applyAlignInput(input: string, context: ToolContext): ToolResult {
    const normalized = input.trim().toLowerCase();

    if (normalized === "y" || normalized === "yes" || normalized === "s" || normalized === "sim") {
      this.params = { ...this.params, alignToTangent: true };
      this.advancePhaseFromParams(context);
      this.refreshPreview(context);
      return TOOL_RESULT_NONE;
    }

    if (normalized === "n" || normalized === "no" || normalized === "nao" || normalized === "não") {
      this.params = { ...this.params, alignToTangent: false };
      this.advancePhaseFromParams(context);
      this.refreshPreview(context);
      return TOOL_RESULT_NONE;
    }

    context.showMessage("[PathArray] Align items to path? Yes/No <Yes>");
    return TOOL_RESULT_NONE;
  }

  private applyConfirmationInput(input: string, context: ToolContext): ToolResult {
    const normalized = input.trim().toLowerCase();

    if (normalized === "y" || normalized === "yes" || normalized === "s" || normalized === "sim") {
      return this.commitArray(context);
    }

    if (normalized === "n" || normalized === "no" || normalized === "nao" || normalized === "não") {
      this.hugeArrayAcknowledged = false;
      this.phase = "specify_count";
      this.params = { ...this.params, count: null };
      context.clearPreview();
      context.showMessage("[PathArray] Specify item count");
      return { type: "cancel" };
    }

    context.showMessage("[PathArray] Confirm array? Yes/No <Yes>");
    return TOOL_RESULT_NONE;
  }

  private commitArray(context: ToolContext): ToolResult {
    const pathSource = this.resolvePathSource(context);
    const params = this.requirePathArrayParams();

    if (pathSource === null || params === null) {
      context.showMessage("[PathArray] Invalid count");
      this.phase = this.params.pathEntityId === null ? "select_path" : "specify_count";
      return { type: "error", message: "[PathArray] Invalid count" };
    }

    const validation = validatePathArrayParams(params, pathSource);

    if (!validation.ok) {
      context.showMessage("[PathArray] Invalid count");
      this.phase = "specify_count";
      this.params = { ...this.params, count: null };
      this.hugeArrayAcknowledged = false;
      context.clearPreview();
      return { type: "error", message: "[PathArray] Invalid count" };
    }

    const sourceEntities = this.resolveSourceEntities(context);

    if (sourceEntities.length === 0) {
      context.showMessage("[PathArray] Select objects");
      this.phase = "selecting_objects";
      return { type: "error", message: "[PathArray] Select objects" };
    }

    const estimated = estimatePathArrayEntityCount(sourceEntities.length, params);

    if (estimated >= HUGE_ARRAY_WARNING_THRESHOLD && !this.hugeArrayAcknowledged) {
      this.hugeArrayAcknowledged = true;
      context.showMessage("[PathArray] Large array may affect performance");
      return TOOL_RESULT_NONE;
    }

    const result = buildPathArrayEntities(sourceEntities, { path: pathSource, params });

    if (result.totalNewEntities === 0) {
      context.showMessage("[PathArray] Invalid count");
      return { type: "error", message: "[PathArray] Invalid count" };
    }

    const command = new ArrayEntitiesCommand(this.confirmedSelection, result.createdEntities);
    context.executeCommand(command);
    context.clearPreview();
    context.showMessage(`[PathArray] ${result.totalNewEntities} entities created`);

    // O fluxo retorna a ferramenta para selecao preservando os parametros base/path/count/align para reuso.
    this.phase = "specify_base_point";
    this.params = { ...this.params, basePoint: null };
    this.hugeArrayAcknowledged = false;

    return { type: "command", command };
  }

  private advancePhaseFromParams(context: ToolContext): void {
    if (this.params.basePoint === null) {
      this.phase = "specify_base_point";
      context.showMessage("[PathArray] Specify base point");
      return;
    }

    if (this.params.pathEntityId === null) {
      this.phase = "select_path";
      context.showMessage("[PathArray] Select path entity");
      return;
    }

    if (this.params.count === null) {
      this.phase = "specify_count";
      context.showMessage("[PathArray] Specify item count");
      return;
    }

    if (this.phase === "specify_count") {
      this.phase = "confirm_align";
      context.showMessage("[PathArray] Align items to path? Yes/No <Yes>");
      return;
    }

    this.phase = "confirm_array";
    context.showMessage("[PathArray] Confirm array? Yes/No <Yes>");
  }

  private refreshPreview(context: ToolContext): void {
    const pathSource = this.resolvePathSource(context);
    const params = this.requirePathArrayParams();

    if (pathSource === null || params === null) {
      context.clearPreview();
      return;
    }

    const validation = validatePathArrayParams(params, pathSource);

    if (!validation.ok) {
      context.clearPreview();
      return;
    }

    const sourceEntities = this.resolveSourceEntities(context);

    if (sourceEntities.length === 0) {
      context.clearPreview();
      return;
    }

    const estimated = estimatePathArrayEntityCount(sourceEntities.length, params);

    if (estimated >= LARGE_ARRAY_WARNING_THRESHOLD) {
      context.showMessage("[PathArray] Large array may affect performance");
    }

    const limitedEntities = buildLimitedPathArrayPreview(
      sourceEntities,
      pathSource,
      params,
      PREVIEW_ENTITY_BUDGET
    );

    context.setPreview({
      type: "ghostEntities",
      entities: limitedEntities
    });
  }

  private resolveSourceEntities(context: ToolContext): ReadonlyArray<CadEntity> {
    const ids = new Set(this.confirmedSelection);
    return context.document.entities.filter((entity) => ids.has(entity.id));
  }

  private resolvePathSource(context: ToolContext): PathSource | null {
    // O metodo converte a entidade do path em PathSource para reuso com line/circle/arc/polyline.
    if (this.params.pathEntityId === null) {
      return null;
    }

    const entity = context.document.entities.find((candidate) => candidate.id === this.params.pathEntityId);

    if (entity === undefined) {
      return null;
    }

    return entityToPathSource(entity);
  }

  private requirePathArrayParams(): PathArrayParams | null {
    if (this.params.basePoint === null || this.params.count === null) {
      return null;
    }

    return {
      basePoint: this.params.basePoint,
      count: this.params.count,
      alignToTangent: this.params.alignToTangent
    };
  }

  private currentPrompt(): string {
    switch (this.phase) {
      case "selecting_objects":
        return "[PathArray] Select objects";
      case "specify_base_point":
        return "[PathArray] Specify base point";
      case "select_path":
        return "[PathArray] Select path entity";
      case "specify_count":
        return "[PathArray] Specify item count";
      case "confirm_align":
        return "[PathArray] Align items to path? Yes/No <Yes>";
      case "confirm_array":
        return "[PathArray] Confirm array? Yes/No <Yes>";
    }
  }
}

function parseCountInput(rawInput: string): number | null {
  // O parser aceita um numero solto ou um par chave=valor com count/quantidade.
  const trimmed = rawInput.trim().toLowerCase();
  const match = trimmed.match(/^(?:(count|copias|n|quantidade|qtd|items|itens)\s*=\s*)?([-+]?\d+)$/i);

  if (match === null || match[2] === undefined) {
    return null;
  }

  const value = Number.parseInt(match[2], 10);

  if (!Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

function parsePointInput(rawInput: string): Point2D | null {
  // O parser aceita coordenadas no formato "x,y" para o basePoint via linha de comando.
  const match = rawInput.trim().match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[\s,]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);

  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }

  const x = Number(match[1]);
  const y = Number(match[2]);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function filterSelectableIds(context: ToolContext, ids: ReadonlyArray<EntityId>): ReadonlyArray<EntityId> {
  // O metodo descarta entidades inexistentes, em layers invisiveis ou bloqueadas.
  const lockedLayerIds = new Set(context.document.layers.filter((layer) => layer.locked).map((layer) => layer.id));
  const invisibleLayerIds = new Set(context.document.layers.filter((layer) => !layer.visible).map((layer) => layer.id));
  const seen = new Set<EntityId>();
  const result: EntityId[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }

    const entity = context.document.entities.find((candidate) => candidate.id === id);

    if (entity === undefined) {
      continue;
    }

    const layerId = entity.layerId || "layer_0";

    if (lockedLayerIds.has(layerId) || invisibleLayerIds.has(layerId)) {
      continue;
    }

    seen.add(id);
    result.push(id);
  }

  return result;
}

function isLayerLocked(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));
  return layer?.locked === true;
}

function buildLimitedPathArrayPreview(
  sourceEntities: ReadonlyArray<CadEntity>,
  source: PathSource,
  params: PathArrayParams,
  budget: number
): ReadonlyArray<CadEntity> {
  // O metodo gera as entidades fantasmas em ordem ate atingir o orcamento, evitando alocacoes massivas.
  if (budget <= 0 || sourceEntities.length === 0) {
    return [];
  }

  const samples = samplePathByCount(ensurePathSource(source), params.count);
  const limit = Math.min(samples.length * sourceEntities.length, budget);
  const previewEntities: CadEntity[] = [];
  let sequence = 0;

  for (const sample of samples) {
    if (previewEntities.length >= limit) {
      break;
    }

    const transform = getPolylineTransformAtSample(sample, params.basePoint, params.alignToTangent);

    for (const entity of sourceEntities) {
      if (previewEntities.length >= limit) {
        break;
      }

      previewEntities.push(transformEntityForPathArray(entity, transform, previewIdFactory(entity, sample, sequence)));
      sequence += 1;
    }
  }

  return previewEntities;
}

function previewIdFactory(sourceEntity: CadEntity, _sample: PathSample, sequence: number): EntityId {
  return `arraypath_preview_${sourceEntity.id}_${sequence}`;
}

function isSupportedPathEntity(entity: CadEntity): boolean {
  // O metodo lista os tipos aceitos como path: polyline, line, circle e arc.
  return entity.type === "polyline" || entity.type === "line" || entity.type === "circle" || entity.type === "arc";
}

function entityToPathSource(entity: CadEntity): PathSource | null {
  // O metodo converte a entidade selecionada em PathSource compatible com pathArray e pathSource.
  if (entity.type === "polyline") {
    return { type: "polyline", points: entity.points, closed: entity.closed };
  }

  if (entity.type === "line") {
    return { type: "line", start: entity.start, end: entity.end };
  }

  if (entity.type === "circle") {
    return { type: "circle", center: entity.center, radius: entity.radius };
  }

  if (entity.type === "arc") {
    return {
      type: "arc",
      center: entity.center,
      radius: entity.radius,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle,
      clockwise: entity.clockwise
    };
  }

  return null;
}
