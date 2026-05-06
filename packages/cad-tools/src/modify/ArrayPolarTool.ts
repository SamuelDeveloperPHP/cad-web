import {
  ArrayEntitiesCommand,
  arrayCadEntitiesPolar,
  estimatePolarArrayEntityCount,
  rotateCadEntityAroundCenter,
  translateCadEntityWithoutRotation,
  type CadEntity,
  type EntityId
} from "@cad-web/cad-core";
import {
  buildPolarArrayAngles,
  validatePolarArrayParams,
  type PolarArrayParams,
  type Point2D
} from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { findNearestEntityId } from "../selection/hitTesting";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

// O modulo descreve a ferramenta Array Polar, que multiplica entidades em torno de um centro com angulo total configuravel.
// O fluxo segue o padrao das demais ferramentas: maquina de estados, preview ghost e geracao de comando apenas na confirmacao.

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;
const PREVIEW_ENTITY_BUDGET = 2_000;
const LARGE_ARRAY_WARNING_THRESHOLD = 10_000;
const HUGE_ARRAY_WARNING_THRESHOLD = 50_000;

type ArrayPolarPhase =
  // O usuario seleciona entidades antes ou durante a ferramenta e confirma com Enter.
  | "selecting_objects"
  // O usuario clica no ponto que sera usado como centro de rotacao.
  | "specify_center"
  // O usuario informa o numero total de copias incluindo a original.
  | "specify_count"
  // O usuario informa o angulo total a ser preenchido em graus.
  | "specify_fill_angle"
  // O usuario opta por rotacionar cada copia em sintonia com a posicao polar.
  | "specify_rotate_items"
  // O preview ja esta visivel e aguarda Yes/No para confirmar a criacao.
  | "confirm_array";

type ArrayPolarWorkingParams = Readonly<{
  center: Point2D | null;
  count: number | null;
  fillAngleDegrees: number | null;
  rotateItems: boolean;
}>;

const EMPTY_POLAR_PARAMS: ArrayPolarWorkingParams = {
  center: null,
  count: null,
  fillAngleDegrees: null,
  rotateItems: true
};

export class ArrayPolarTool implements CadTool {
  readonly id = "arrayPolar";
  readonly name = "Array Polar";
  readonly aliases = ["ap", "arraypolar", "matrizpolar", "polar"];

  private phase: ArrayPolarPhase = "selecting_objects";
  private params: ArrayPolarWorkingParams = EMPTY_POLAR_PARAMS;
  private confirmedSelection: ReadonlyArray<EntityId> = [];
  private hugeArrayAcknowledged = false;

  activate(context: ToolContext): void {
    // O metodo respeita uma selecao previa do usuario para acelerar o fluxo de uso recorrente.
    this.params = EMPTY_POLAR_PARAMS;
    this.confirmedSelection = [];
    this.hugeArrayAcknowledged = false;
    context.clearPreview();

    if (context.selection.entityIds.length > 0) {
      this.confirmedSelection = filterSelectableIds(context, context.selection.entityIds);

      if (this.confirmedSelection.length > 0) {
        this.phase = "specify_center";
        context.showMessage("[ArrayPolar] Specify center point");
        return;
      }
    }

    this.phase = "selecting_objects";
    context.showMessage("[ArrayPolar] Select objects");
  }

  deactivate(context: ToolContext): void {
    // O metodo limpa preview e estado interno mas preserva selection para a proxima ativacao.
    this.params = EMPTY_POLAR_PARAMS;
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

    if (this.phase === "specify_center") {
      const center = resolveSnappedPoint(event, context);
      this.params = { ...this.params, center };
      this.advancePhaseFromParams(context);
      this.refreshPreview(context);
      return TOOL_RESULT_NONE;
    }

    // O ponteiro nao avanca a ferramenta enquanto faltam parametros numericos.
    context.showMessage(this.currentPrompt());
    return TOOL_RESULT_NONE;
  }

  onPointerMove(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    // O preview e disparado apenas apos todos os parametros estarem definidos.
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
    // O metodo aceita parametros isolados ou compactos como "count=6 angle=360 rotate=yes".
    const trimmed = input.trim();

    if (trimmed.length === 0) {
      return this.handleEnter(context);
    }

    if (this.phase === "selecting_objects") {
      context.showMessage("[ArrayPolar] Select objects");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "specify_center") {
      const point = parsePointInput(trimmed);

      if (point === null) {
        context.showMessage("[ArrayPolar] Specify center point");
        return { type: "error", message: "[ArrayPolar] Invalid array parameters" };
      }

      this.params = { ...this.params, center: point };
      this.advancePhaseFromParams(context);
      this.refreshPreview(context);
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "confirm_array") {
      return this.applyConfirmationInput(trimmed, context);
    }

    if (this.phase === "specify_rotate_items") {
      return this.applyRotateItemsInput(trimmed, context);
    }

    const compact = parseCompactPolarInput(trimmed);

    if (compact !== null) {
      return this.applyPartialParams(compact, context);
    }

    const numericValue = parseNamedSinglePolarValue(trimmed, this.phase);

    if (numericValue === null) {
      context.showMessage("[ArrayPolar] Invalid array parameters");
      return { type: "error", message: "[ArrayPolar] Invalid array parameters" };
    }

    if (this.phase === "specify_count") {
      return this.applyPartialParams({ count: numericValue }, context);
    }

    return this.applyPartialParams({ fillAngleDegrees: numericValue }, context);
  }

  private handleEnter(context: ToolContext): ToolResult {
    if (this.phase === "selecting_objects") {
      const filtered = filterSelectableIds(context, context.selection.entityIds);

      if (filtered.length === 0) {
        context.showMessage("[ArrayPolar] Select objects");
        return TOOL_RESULT_NONE;
      }

      this.confirmedSelection = filtered;
      this.phase = "specify_center";
      context.showMessage("[ArrayPolar] Specify center point");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "specify_rotate_items") {
      // O Enter sem texto aceita o default Yes para rotacionar as copias.
      this.params = { ...this.params, rotateItems: true };
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
    if (this.phase === "specify_center") {
      this.confirmedSelection = [];
      this.phase = "selecting_objects";
      context.showMessage("[ArrayPolar] Select objects");
      return { type: "cancel" };
    }

    if (this.phase === "specify_count") {
      this.params = { ...this.params, center: null };
      this.phase = "specify_center";
      context.clearPreview();
      context.showMessage("[ArrayPolar] Specify center point");
      return { type: "cancel" };
    }

    if (this.phase === "specify_fill_angle") {
      this.params = { ...this.params, count: null };
      this.phase = "specify_count";
      context.clearPreview();
      context.showMessage("[ArrayPolar] Specify count");
      return { type: "cancel" };
    }

    if (this.phase === "specify_rotate_items") {
      this.params = { ...this.params, fillAngleDegrees: null };
      this.phase = "specify_fill_angle";
      context.clearPreview();
      context.showMessage("[ArrayPolar] Specify fill angle in degrees");
      return { type: "cancel" };
    }

    if (this.phase === "confirm_array") {
      this.hugeArrayAcknowledged = false;
      this.phase = "specify_rotate_items";
      context.clearPreview();
      context.showMessage("[ArrayPolar] Rotate items? Yes/No <Yes>");
      return { type: "cancel" };
    }

    this.deactivate(context);
    context.showMessage("[ArrayPolar] Cancelled");
    return { type: "cancel" };
  }

  private toggleEntityAtPoint(point: Point2D, context: ToolContext): ToolResult {
    // O metodo permite que o usuario clique para adicionar ou remover entidades da selecao temporaria.
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
      context.showMessage("[ArrayPolar] Layer is locked");
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

  private applyPartialParams(partial: ArrayPolarWorkingParamsPatch, context: ToolContext): ToolResult {
    // O metodo mescla os parametros recebidos e avalia se o preview pode ser gerado.
    const next: ArrayPolarWorkingParams = {
      center: partial.center ?? this.params.center,
      count: partial.count ?? this.params.count,
      fillAngleDegrees: partial.fillAngleDegrees ?? this.params.fillAngleDegrees,
      rotateItems: partial.rotateItems ?? this.params.rotateItems
    };

    if (next.count !== null && (!Number.isInteger(next.count) || next.count < 2)) {
      context.showMessage("[ArrayPolar] Invalid array parameters");
      return { type: "error", message: "[ArrayPolar] Invalid array parameters" };
    }

    if (next.fillAngleDegrees !== null) {
      if (!Number.isFinite(next.fillAngleDegrees) || Math.abs(next.fillAngleDegrees) < 1e-6) {
        context.showMessage("[ArrayPolar] Invalid array parameters");
        return { type: "error", message: "[ArrayPolar] Invalid array parameters" };
      }
    }

    this.params = next;
    this.advancePhaseFromParams(context);

    if (this.phase === "confirm_array") {
      this.refreshPreview(context);
    }

    return TOOL_RESULT_NONE;
  }

  private applyConfirmationInput(input: string, context: ToolContext): ToolResult {
    const normalized = input.trim().toLowerCase();

    if (normalized === "y" || normalized === "yes" || normalized === "s" || normalized === "sim") {
      return this.commitArray(context);
    }

    if (normalized === "n" || normalized === "no" || normalized === "nao" || normalized === "não") {
      // O cancelamento devolve o usuario para a fase de fill angle para ajustar parametros.
      this.hugeArrayAcknowledged = false;
      this.phase = "specify_fill_angle";
      this.params = { ...this.params, fillAngleDegrees: null };
      context.clearPreview();
      context.showMessage("[ArrayPolar] Specify fill angle in degrees");
      return { type: "cancel" };
    }

    context.showMessage("[ArrayPolar] Confirm array? Yes/No <Yes>");
    return TOOL_RESULT_NONE;
  }

  private applyRotateItemsInput(input: string, context: ToolContext): ToolResult {
    const normalized = input.trim().toLowerCase();

    if (normalized === "y" || normalized === "yes" || normalized === "s" || normalized === "sim") {
      this.params = { ...this.params, rotateItems: true };
      this.advancePhaseFromParams(context);
      this.refreshPreview(context);
      return TOOL_RESULT_NONE;
    }

    if (normalized === "n" || normalized === "no" || normalized === "nao" || normalized === "não") {
      this.params = { ...this.params, rotateItems: false };
      this.advancePhaseFromParams(context);
      this.refreshPreview(context);
      return TOOL_RESULT_NONE;
    }

    context.showMessage("[ArrayPolar] Rotate items? Yes/No <Yes>");
    return TOOL_RESULT_NONE;
  }

  private commitArray(context: ToolContext): ToolResult {
    const polarParams = this.requirePolarParams();

    if (polarParams === null || this.params.center === null) {
      context.showMessage("[ArrayPolar] Invalid array parameters");
      this.phase = "specify_center";
      return { type: "error", message: "[ArrayPolar] Invalid array parameters" };
    }

    const validation = validatePolarArrayParams(polarParams);

    if (!validation.ok) {
      context.showMessage("[ArrayPolar] Invalid array parameters");
      this.phase = "specify_count";
      this.params = { ...this.params, count: null, fillAngleDegrees: null };
      this.hugeArrayAcknowledged = false;
      context.clearPreview();
      return { type: "error", message: "[ArrayPolar] Invalid array parameters" };
    }

    const sourceEntities = this.resolveSourceEntities(context);

    if (sourceEntities.length === 0) {
      context.showMessage("[ArrayPolar] Select objects");
      this.phase = "selecting_objects";
      return { type: "error", message: "[ArrayPolar] Select objects" };
    }

    const estimated = estimatePolarArrayEntityCount(sourceEntities.length, polarParams);

    if (estimated >= HUGE_ARRAY_WARNING_THRESHOLD && !this.hugeArrayAcknowledged) {
      this.hugeArrayAcknowledged = true;
      context.showMessage("[ArrayPolar] Large array may affect performance");
      return TOOL_RESULT_NONE;
    }

    const result = arrayCadEntitiesPolar(sourceEntities, {
      center: this.params.center,
      params: polarParams,
      rotateItems: this.params.rotateItems
    });

    if (result.totalNewEntities === 0) {
      context.showMessage("[ArrayPolar] Invalid array parameters");
      return { type: "error", message: "[ArrayPolar] Invalid array parameters" };
    }

    const command = new ArrayEntitiesCommand(this.confirmedSelection, result.createdEntities);
    context.executeCommand(command);
    context.clearPreview();
    context.showMessage(`[ArrayPolar] ${result.totalNewEntities} entities created`);

    // O fluxo retorna a ferramenta para a fase de centro preservando count, angulo e rotateItems para encadear.
    this.phase = "specify_center";
    this.params = { ...this.params, center: null };
    this.hugeArrayAcknowledged = false;

    return { type: "command", command };
  }

  private advancePhaseFromParams(context: ToolContext): void {
    if (this.params.center === null) {
      this.phase = "specify_center";
      context.showMessage("[ArrayPolar] Specify center point");
      return;
    }

    if (this.params.count === null) {
      this.phase = "specify_count";
      context.showMessage("[ArrayPolar] Specify count");
      return;
    }

    if (this.params.fillAngleDegrees === null) {
      this.phase = "specify_fill_angle";
      context.showMessage("[ArrayPolar] Specify fill angle in degrees");
      return;
    }

    if (this.phase === "specify_count" || this.phase === "specify_fill_angle") {
      this.phase = "specify_rotate_items";
      context.showMessage("[ArrayPolar] Rotate items? Yes/No <Yes>");
      return;
    }

    this.phase = "confirm_array";
    context.showMessage("[ArrayPolar] Confirm array? Yes/No <Yes>");
  }

  private refreshPreview(context: ToolContext): void {
    const polarParams = this.requirePolarParams();

    if (polarParams === null || this.params.center === null) {
      context.clearPreview();
      return;
    }

    const validation = validatePolarArrayParams(polarParams);

    if (!validation.ok) {
      context.clearPreview();
      return;
    }

    const sourceEntities = this.resolveSourceEntities(context);

    if (sourceEntities.length === 0) {
      context.clearPreview();
      return;
    }

    const estimated = estimatePolarArrayEntityCount(sourceEntities.length, polarParams);

    if (estimated >= LARGE_ARRAY_WARNING_THRESHOLD) {
      context.showMessage("[ArrayPolar] Large array may affect performance");
    }

    const limitedEntities = buildLimitedPolarPreview(
      sourceEntities,
      this.params.center,
      polarParams,
      this.params.rotateItems,
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

  private requirePolarParams(): PolarArrayParams | null {
    if (this.params.count === null || this.params.fillAngleDegrees === null) {
      return null;
    }

    return {
      count: this.params.count,
      fillAngleRadians: degreesToRadians(this.params.fillAngleDegrees)
    };
  }

  private currentPrompt(): string {
    switch (this.phase) {
      case "selecting_objects":
        return "[ArrayPolar] Select objects";
      case "specify_center":
        return "[ArrayPolar] Specify center point";
      case "specify_count":
        return "[ArrayPolar] Specify count";
      case "specify_fill_angle":
        return "[ArrayPolar] Specify fill angle in degrees";
      case "specify_rotate_items":
        return "[ArrayPolar] Rotate items? Yes/No <Yes>";
      case "confirm_array":
        return "[ArrayPolar] Confirm array? Yes/No <Yes>";
    }
  }
}

type ArrayPolarWorkingParamsPatch = {
  center?: Point2D;
  count?: number;
  fillAngleDegrees?: number;
  rotateItems?: boolean;
};

export function parseCompactPolarInput(rawInput: string): ArrayPolarWorkingParamsPatch | null {
  // O metodo decodifica entradas como "count=6 angle=360 rotate=yes" ou "6,360".
  const trimmed = rawInput.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const lowercased = trimmed.toLowerCase();

  if (/[a-z]/.test(lowercased) && /=/.test(lowercased)) {
    const tokens = lowercased.split(/\s+/);
    const partial: ArrayPolarWorkingParamsPatch = {};
    let hasMatch = false;

    for (const token of tokens) {
      const numericMatch = token.match(/^(count|copias|n|angle|fillangle|fill_angle|angulo|deg|rotate|rotacionar)\s*=\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?|yes|no|sim|nao|s|n|y)$/i);

      if (numericMatch === null || numericMatch[1] === undefined || numericMatch[2] === undefined) {
        return null;
      }

      hasMatch = true;
      assignNamedPolarParam(partial, numericMatch[1], numericMatch[2]);
    }

    return hasMatch ? partial : null;
  }

  if (/,/.test(lowercased)) {
    const parts = lowercased.split(",").map((segment) => segment.trim());

    if (parts.length < 2 || parts.length > 3) {
      return null;
    }

    const numbers = parts.map((part) => Number(part));

    if (numbers.some((value) => !Number.isFinite(value))) {
      return null;
    }

    const partial: ArrayPolarWorkingParamsPatch = {};

    if (numbers[0] !== undefined) {
      partial.count = numbers[0];
    }

    if (numbers[1] !== undefined) {
      partial.fillAngleDegrees = numbers[1];
    }

    return partial;
  }

  return null;
}

function parseNamedSinglePolarValue(rawInput: string, phase: ArrayPolarPhase): number | null {
  // O parser aceita um numero solto ou um par chave=valor associado a fase atual.
  const trimmed = rawInput.trim().toLowerCase();
  const match = trimmed.match(/^(?:(count|copias|n|angle|fillangle|fill_angle|angulo|deg)\s*=\s*)?([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);

  if (match === null || match[2] === undefined) {
    return null;
  }

  const value = Number(match[2]);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (match[1] !== undefined) {
    const expectedPhase = polarKeyToPhase(match[1]);
    if (expectedPhase !== null && expectedPhase !== phase) {
      return null;
    }
  }

  return value;
}

function assignNamedPolarParam(partial: ArrayPolarWorkingParamsPatch, key: string, rawValue: string): void {
  const lowered = key.toLowerCase();

  if (lowered === "count" || lowered === "copias" || lowered === "n") {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      partial.count = value;
    }
    return;
  }

  if (lowered === "angle" || lowered === "fillangle" || lowered === "fill_angle" || lowered === "angulo" || lowered === "deg") {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      partial.fillAngleDegrees = value;
    }
    return;
  }

  if (lowered === "rotate" || lowered === "rotacionar") {
    const normalized = rawValue.toLowerCase();
    if (normalized === "yes" || normalized === "y" || normalized === "sim" || normalized === "s") {
      partial.rotateItems = true;
    } else if (normalized === "no" || normalized === "n" || normalized === "nao") {
      partial.rotateItems = false;
    }
  }
}

function polarKeyToPhase(rawKey: string): ArrayPolarPhase | null {
  const lowered = rawKey.toLowerCase();

  if (lowered === "count" || lowered === "copias" || lowered === "n") {
    return "specify_count";
  }

  if (lowered === "angle" || lowered === "fillangle" || lowered === "fill_angle" || lowered === "angulo" || lowered === "deg") {
    return "specify_fill_angle";
  }

  return null;
}

function parsePointInput(rawInput: string): Point2D | null {
  // O parser aceita coordenadas no formato "x,y" para definir o centro via linha de comando.
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

function buildLimitedPolarPreview(
  sourceEntities: ReadonlyArray<CadEntity>,
  center: Point2D,
  params: PolarArrayParams,
  rotateItems: boolean,
  budget: number
): ReadonlyArray<CadEntity> {
  // O metodo gera as entidades fantasmas em ordem ate atingir o orcamento, evitando alocacoes massivas.
  if (budget <= 0 || sourceEntities.length === 0) {
    return [];
  }

  const angles = buildPolarArrayAngles(params);
  const limit = Math.min(angles.length * sourceEntities.length, budget);
  const previewEntities: CadEntity[] = [];
  let sequence = 0;

  for (const angle of angles) {
    if (previewEntities.length >= limit) {
      break;
    }

    for (const entity of sourceEntities) {
      if (previewEntities.length >= limit) {
        break;
      }

      const newId = previewIdFactory(entity, angle, sequence);

      if (rotateItems) {
        previewEntities.push(rotateCadEntityAroundCenter(entity, center, angle, newId));
      } else {
        // O modo translacional preserva a orientacao original e apenas posiciona em torno do centro.
        previewEntities.push(translateCadEntityWithoutRotation(entity, center, angle, newId));
      }

      sequence += 1;
    }
  }

  return previewEntities;
}

function previewIdFactory(sourceEntity: CadEntity, _angleRadians: number, sequence: number): EntityId {
  return `arraypolar_preview_${sourceEntity.id}_${sequence}`;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
