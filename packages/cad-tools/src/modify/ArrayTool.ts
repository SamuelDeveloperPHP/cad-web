import {
  ArrayEntitiesCommand,
  arrayCadEntitiesRectangular,
  cloneCadEntityWithOffset,
  estimateArrayEntityCount,
  type CadEntity,
  type EntityId,
  type LineEntity
} from "@cad-web/cad-core";
import {
  buildRectangularArrayOffsets,
  validateRectangularArrayParams,
  type Point2D,
  type RectangularArrayParams
} from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { findNearestEntityId } from "../selection/hitTesting";

// O modulo descreve a ferramenta interativa Array Retangular, que multiplica entidades em uma matriz linhas x colunas.
// O fluxo segue o padrao das demais ferramentas: maquina de estados, preview ghost e geracao de comando apenas na confirmacao.

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;

// O limite de preview evita travar a UI ao gerar centenas de milhares de entidades fantasmas.
const PREVIEW_ENTITY_BUDGET = 2_000;

// O aviso suave aparece para arrays significativos sem bloquear o usuario.
const LARGE_ARRAY_WARNING_THRESHOLD = 10_000;

// O aviso forte sinaliza que a operacao pode ser custosa para o renderer.
const HUGE_ARRAY_WARNING_THRESHOLD = 50_000;

type ArrayPhase =
  // O usuario seleciona entidades antes ou durante a ferramenta e confirma com Enter.
  | "selecting_objects"
  // O usuario informa a quantidade de linhas da matriz.
  | "specify_rows"
  // O usuario informa a quantidade de colunas da matriz.
  | "specify_columns"
  // O usuario informa o espacamento entre colunas (eixo X).
  | "specify_spacing_x"
  // O usuario informa o espacamento entre linhas (eixo Y).
  | "specify_spacing_y"
  // O preview ja esta visivel e aguarda Yes/No para confirmar a criacao.
  | "confirm_array";

type ArrayWorkingParams = Readonly<{
  rows: number | null;
  columns: number | null;
  spacingX: number | null;
  spacingY: number | null;
}>;

type ArrayWorkingParamsPatch = {
  rows?: number;
  columns?: number;
  spacingX?: number;
  spacingY?: number;
};

const EMPTY_PARAMS: ArrayWorkingParams = {
  rows: null,
  columns: null,
  spacingX: null,
  spacingY: null
};

export class ArrayTool implements CadTool {
  readonly id = "array";
  readonly name = "Array";
  readonly aliases = ["ar", "array", "matriz"];

  private phase: ArrayPhase = "selecting_objects";
  private params: ArrayWorkingParams = EMPTY_PARAMS;
  private confirmedSelection: ReadonlyArray<EntityId> = [];
  private previewEntities: ReadonlyArray<CadEntity> | null = null;
  private hugeArrayAcknowledged = false;

  activate(context: ToolContext): void {
    // O metodo respeita uma selecao previa do usuario para acelerar o fluxo de uso recorrente.
    this.params = EMPTY_PARAMS;
    this.confirmedSelection = [];
    this.previewEntities = null;
    this.hugeArrayAcknowledged = false;
    context.clearPreview();

    if (context.selection.entityIds.length > 0) {
      this.confirmedSelection = filterSelectableIds(context, context.selection.entityIds);

      if (this.confirmedSelection.length > 0) {
        this.phase = "specify_rows";
        context.showMessage("[Array] Specify rows");
        return;
      }
    }

    this.phase = "selecting_objects";
    context.showMessage("[Array] Select objects");
  }

  deactivate(context: ToolContext): void {
    // O metodo limpa preview e estado mas nao toca em context.selection para permitir reutilizacao.
    this.params = EMPTY_PARAMS;
    this.confirmedSelection = [];
    this.previewEntities = null;
    this.hugeArrayAcknowledged = false;
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary") {
      return TOOL_RESULT_NONE;
    }

    if (this.phase !== "selecting_objects") {
      // O ponteiro nao avanca a ferramenta enquanto faltam parametros numericos da matriz.
      context.showMessage(this.currentPrompt());
      return TOOL_RESULT_NONE;
    }

    return this.toggleEntityAtPoint(event.worldPoint, context);
  }

  onPointerMove(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    // O metodo nao gera preview baseado em ponteiro; o preview do array e disparado apos receber rows/cols/spacing.
    return TOOL_RESULT_NONE;
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      // O Esc cancela a etapa atual e devolve o usuario para a fase anterior conforme o padrao do projeto.
      return this.handleEscape(context);
    }

    if (event.key === "Enter") {
      return this.handleEnter(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    // O metodo aceita parametros isolados ("3") ou compactos ("rows=3 cols=4 dx=100 dy=50") em qualquer fase.
    const trimmed = input.trim();

    if (trimmed.length === 0) {
      return this.handleEnter(context);
    }

    if (this.phase === "selecting_objects") {
      // O comando vazio confirma selecao; demais entradas nesta fase sao ignoradas para evitar pular etapa.
      context.showMessage("[Array] Select objects");
      return TOOL_RESULT_NONE;
    }

    const compact = parseCompactArrayInput(trimmed);

    if (compact !== null) {
      return this.applyPartialParams(compact, context);
    }

    if (this.phase === "confirm_array") {
      return this.applyConfirmationInput(trimmed, context);
    }

    const numericValue = parseNamedSingleValue(trimmed, this.phase);

    if (numericValue === null) {
      context.showMessage("[Array] Invalid array parameters");
      return { type: "error", message: "[Array] Invalid array parameters" };
    }

    if (this.phase === "specify_rows") {
      return this.applyPartialParams({ rows: numericValue }, context);
    }

    if (this.phase === "specify_columns") {
      return this.applyPartialParams({ columns: numericValue }, context);
    }

    if (this.phase === "specify_spacing_x") {
      return this.applyPartialParams({ spacingX: numericValue }, context);
    }

    return this.applyPartialParams({ spacingY: numericValue }, context);
  }

  private handleEnter(context: ToolContext): ToolResult {
    if (this.phase === "selecting_objects") {
      const filtered = filterSelectableIds(context, context.selection.entityIds);

      if (filtered.length === 0) {
        context.showMessage("[Array] Select objects");
        return TOOL_RESULT_NONE;
      }

      this.confirmedSelection = filtered;
      this.phase = "specify_rows";
      context.showMessage("[Array] Specify rows");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "confirm_array") {
      // O Enter sem texto confirma o preview, replicando o default <Yes>.
      return this.commitArray(context);
    }

    context.showMessage(this.currentPrompt());
    return TOOL_RESULT_NONE;
  }

  private handleEscape(context: ToolContext): ToolResult {
    if (this.phase === "specify_rows") {
      this.confirmedSelection = [];
      this.phase = "selecting_objects";
      context.showMessage("[Array] Select objects");
      return { type: "cancel" };
    }

    if (this.phase === "specify_columns") {
      this.params = { ...this.params, rows: null };
      this.phase = "specify_rows";
      context.showMessage("[Array] Specify rows");
      return { type: "cancel" };
    }

    if (this.phase === "specify_spacing_x") {
      this.params = { ...this.params, columns: null };
      this.phase = "specify_columns";
      context.showMessage("[Array] Specify columns");
      return { type: "cancel" };
    }

    if (this.phase === "specify_spacing_y") {
      this.params = { ...this.params, spacingX: null };
      this.phase = "specify_spacing_x";
      context.showMessage("[Array] Specify column spacing");
      return { type: "cancel" };
    }

    if (this.phase === "confirm_array") {
      this.params = { ...this.params, spacingY: null };
      this.previewEntities = null;
      this.hugeArrayAcknowledged = false;
      this.phase = "specify_spacing_y";
      context.clearPreview();
      context.showMessage("[Array] Specify row spacing");
      return { type: "cancel" };
    }

    this.deactivate(context);
    context.showMessage("[Array] Cancelled");
    return { type: "cancel" };
  }

  private toggleEntityAtPoint(point: Point2D, context: ToolContext): ToolResult {
    // O metodo permite que o usuario clique em entidades para adicionar ou remover da selecao temporaria.
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
      context.showMessage("[Array] Layer is locked");
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

  private applyPartialParams(partial: ArrayWorkingParamsPatch, context: ToolContext): ToolResult {
    // O metodo mescla os parametros recebidos e avalia se o preview pode ser gerado.
    const next: ArrayWorkingParams = {
      rows: partial.rows ?? this.params.rows,
      columns: partial.columns ?? this.params.columns,
      spacingX: partial.spacingX ?? this.params.spacingX,
      spacingY: partial.spacingY ?? this.params.spacingY
    };

    if (next.rows !== null && (!Number.isInteger(next.rows) || next.rows < 1)) {
      context.showMessage("[Array] Invalid array parameters");
      return { type: "error", message: "[Array] Invalid array parameters" };
    }

    if (next.columns !== null && (!Number.isInteger(next.columns) || next.columns < 1)) {
      context.showMessage("[Array] Invalid array parameters");
      return { type: "error", message: "[Array] Invalid array parameters" };
    }

    if (next.spacingX !== null && !Number.isFinite(next.spacingX)) {
      context.showMessage("[Array] Invalid array parameters");
      return { type: "error", message: "[Array] Invalid array parameters" };
    }

    if (next.spacingY !== null && !Number.isFinite(next.spacingY)) {
      context.showMessage("[Array] Invalid array parameters");
      return { type: "error", message: "[Array] Invalid array parameters" };
    }

    this.params = next;
    this.advancePhaseFromParams(context);

    if (this.phase === "confirm_array") {
      this.refreshPreview(context);
    }

    return TOOL_RESULT_NONE;
  }

  private applyConfirmationInput(input: string, context: ToolContext): ToolResult {
    // O metodo interpreta a entrada textual de confirmacao em portugues e ingles.
    const normalized = input.trim().toLowerCase();

    if (normalized === "y" || normalized === "yes" || normalized === "s" || normalized === "sim") {
      return this.commitArray(context);
    }

    if (normalized === "n" || normalized === "no" || normalized === "nao" || normalized === "não") {
      this.previewEntities = null;
      this.hugeArrayAcknowledged = false;
      this.phase = "specify_rows";
      this.params = EMPTY_PARAMS;
      context.clearPreview();
      context.showMessage("[Array] Specify rows");
      return { type: "cancel" };
    }

    context.showMessage("[Array] Confirm array? Yes/No <Yes>");
    return TOOL_RESULT_NONE;
  }

  private commitArray(context: ToolContext): ToolResult {
    // O metodo gera as entidades reais e despacha o ArrayEntitiesCommand para o command pattern.
    const params = this.requireFullParams();

    if (params === null) {
      context.showMessage("[Array] Invalid array parameters");
      this.phase = "specify_rows";
      return { type: "error", message: "[Array] Invalid array parameters" };
    }

    const validation = validateRectangularArrayParams(params);

    if (!validation.ok) {
      // O kernel rejeita configuracoes invalidas como spacingX = 0 e spacingY = 0 simultaneos.
      context.showMessage("[Array] Invalid array parameters");
      this.phase = "specify_rows";
      this.params = EMPTY_PARAMS;
      this.previewEntities = null;
      this.hugeArrayAcknowledged = false;
      context.clearPreview();
      return { type: "error", message: "[Array] Invalid array parameters" };
    }

    const sourceEntities = this.resolveSourceEntities(context);

    if (sourceEntities.length === 0) {
      context.showMessage("[Array] Select objects");
      this.phase = "selecting_objects";
      return { type: "error", message: "[Array] Select objects" };
    }

    const estimated = estimateArrayEntityCount(sourceEntities.length, params);

    if (estimated >= HUGE_ARRAY_WARNING_THRESHOLD && !this.hugeArrayAcknowledged) {
      // O aviso forte exige uma segunda confirmacao para arrays massivos.
      this.hugeArrayAcknowledged = true;
      context.showMessage("[Array] Large array may affect performance");
      return TOOL_RESULT_NONE;
    }

    const result = arrayCadEntitiesRectangular(sourceEntities, params);

    if (result.totalNewEntities === 0) {
      context.showMessage("[Array] Invalid array parameters");
      return { type: "error", message: "[Array] Invalid array parameters" };
    }

    const command = new ArrayEntitiesCommand(this.confirmedSelection, result.createdEntities);
    context.executeCommand(command);
    context.clearPreview();
    context.showMessage(`[Array] ${result.totalNewEntities} entities created`);

    // O fluxo retorna a ferramenta para o estado inicial preservando a selecao para encadear novas operacoes.
    this.params = EMPTY_PARAMS;
    this.previewEntities = null;
    this.hugeArrayAcknowledged = false;
    this.phase = "specify_rows";

    return { type: "command", command };
  }

  private advancePhaseFromParams(context: ToolContext): void {
    if (this.params.rows === null) {
      this.phase = "specify_rows";
      context.showMessage("[Array] Specify rows");
      return;
    }

    if (this.params.columns === null) {
      this.phase = "specify_columns";
      context.showMessage("[Array] Specify columns");
      return;
    }

    if (this.params.spacingX === null) {
      this.phase = "specify_spacing_x";
      context.showMessage("[Array] Specify column spacing");
      return;
    }

    if (this.params.spacingY === null) {
      this.phase = "specify_spacing_y";
      context.showMessage("[Array] Specify row spacing");
      return;
    }

    this.phase = "confirm_array";
    context.showMessage("[Array] Confirm array? Yes/No <Yes>");
  }

  private refreshPreview(context: ToolContext): void {
    // O metodo reconstroi o preview ghost respeitando o orcamento de entidades para preservar a performance.
    const params = this.requireFullParams();

    if (params === null) {
      context.clearPreview();
      return;
    }

    const validation = validateRectangularArrayParams(params);

    if (!validation.ok) {
      // O preview e suprimido para configuracoes invalidas, deixando o usuario corrigir os parametros.
      context.clearPreview();
      return;
    }

    const sourceEntities = this.resolveSourceEntities(context);

    if (sourceEntities.length === 0) {
      context.clearPreview();
      return;
    }

    const estimated = estimateArrayEntityCount(sourceEntities.length, params);

    if (estimated >= LARGE_ARRAY_WARNING_THRESHOLD) {
      context.showMessage("[Array] Large array may affect performance");
    }

    // O preview gera apenas o suficiente para preencher o orcamento, evitando custo proporcional ao array completo.
    const limitedEntities = buildLimitedPreviewEntities(sourceEntities, params, PREVIEW_ENTITY_BUDGET);

    this.previewEntities = limitedEntities;

    context.setPreview({
      type: "ghostEntities",
      entities: limitedEntities
    });
  }

  private resolveSourceEntities(context: ToolContext): ReadonlyArray<CadEntity> {
    // O metodo busca o estado atual das entidades selecionadas, ignorando ids removidos do documento.
    const ids = new Set(this.confirmedSelection);
    return context.document.entities.filter((entity) => ids.has(entity.id));
  }

  private requireFullParams(): RectangularArrayParams | null {
    if (
      this.params.rows === null ||
      this.params.columns === null ||
      this.params.spacingX === null ||
      this.params.spacingY === null
    ) {
      return null;
    }

    return {
      rows: this.params.rows,
      columns: this.params.columns,
      spacingX: this.params.spacingX,
      spacingY: this.params.spacingY
    };
  }

  private currentPrompt(): string {
    switch (this.phase) {
      case "selecting_objects":
        return "[Array] Select objects";
      case "specify_rows":
        return "[Array] Specify rows";
      case "specify_columns":
        return "[Array] Specify columns";
      case "specify_spacing_x":
        return "[Array] Specify column spacing";
      case "specify_spacing_y":
        return "[Array] Specify row spacing";
      case "confirm_array":
        return "[Array] Confirm array? Yes/No <Yes>";
    }
  }
}

export function parseCompactArrayInput(rawInput: string): ArrayWorkingParamsPatch | null {
  // O metodo decodifica entradas como "rows=3 cols=4 dx=100 dy=50" ou "3,4,100,50" em parametros numericos.
  const trimmed = rawInput.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const lowercased = trimmed.toLowerCase();

  // O formato com chaves nomeadas separadas por espaco.
  if (/[a-z]/.test(lowercased) && /=/.test(lowercased)) {
    const tokens = lowercased.split(/\s+/);
    const partial: ArrayWorkingParamsPatch = {};
    let hasMatch = false;

    for (const token of tokens) {
      const match = token.match(/^(rows|linhas|columns|cols|colunas|spacingx|spacing_x|dx|spacingy|spacing_y|dy)\s*=\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);

      if (match === null || match[1] === undefined || match[2] === undefined) {
        return null;
      }

      hasMatch = true;
      const value = Number(match[2]);

      if (!Number.isFinite(value)) {
        return null;
      }

      assignNamedParam(partial, match[1], value);
    }

    return hasMatch ? partial : null;
  }

  // O formato compacto separado por virgula deve trazer pelo menos dois numeros.
  if (/,/.test(lowercased)) {
    const parts = lowercased.split(",").map((segment) => segment.trim());

    if (parts.length < 2 || parts.length > 4) {
      return null;
    }

    const numbers = parts.map((part) => Number(part));

    if (numbers.some((value) => !Number.isFinite(value))) {
      return null;
    }

    const partial: ArrayWorkingParamsPatch = {};

    if (numbers[0] !== undefined) {
      partial.rows = numbers[0];
    }

    if (numbers[1] !== undefined) {
      partial.columns = numbers[1];
    }

    if (numbers.length > 2 && numbers[2] !== undefined) {
      partial.spacingX = numbers[2];
    }

    if (numbers.length > 3 && numbers[3] !== undefined) {
      partial.spacingY = numbers[3];
    }

    return partial;
  }

  return null;
}

function parseNamedSingleValue(rawInput: string, phase: ArrayPhase): number | null {
  // O parser aceita um numero solto ("3") ou um par chave=valor associado a fase atual.
  const trimmed = rawInput.trim().toLowerCase();
  const match = trimmed.match(/^(?:(rows|linhas|columns|cols|colunas|spacingx|spacing_x|dx|spacingy|spacing_y|dy)\s*=\s*)?([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);

  if (match === null || match[2] === undefined) {
    return null;
  }

  const value = Number(match[2]);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (match[1] !== undefined) {
    const expectedPhases = phaseFromKey(match[1]);
    if (expectedPhases !== null && !expectedPhases.includes(phase)) {
      return null;
    }
  }

  return value;
}

function assignNamedParam(partial: ArrayWorkingParamsPatch, key: string, value: number): void {
  const lowered = key.toLowerCase();

  if (lowered === "rows" || lowered === "linhas") {
    partial.rows = value;
    return;
  }

  if (lowered === "columns" || lowered === "cols" || lowered === "colunas") {
    partial.columns = value;
    return;
  }

  if (lowered === "spacingx" || lowered === "spacing_x" || lowered === "dx") {
    partial.spacingX = value;
    return;
  }

  if (lowered === "spacingy" || lowered === "spacing_y" || lowered === "dy") {
    partial.spacingY = value;
  }
}

function phaseFromKey(rawKey: string): ReadonlyArray<ArrayPhase> | null {
  const lowered = rawKey.toLowerCase();

  if (lowered === "rows" || lowered === "linhas") {
    return ["specify_rows"];
  }

  if (lowered === "columns" || lowered === "cols" || lowered === "colunas") {
    return ["specify_columns"];
  }

  if (lowered === "spacingx" || lowered === "spacing_x" || lowered === "dx") {
    return ["specify_spacing_x"];
  }

  if (lowered === "spacingy" || lowered === "spacing_y" || lowered === "dy") {
    return ["specify_spacing_y"];
  }

  return null;
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

function isLayerLocked(context: ToolContext, entity: CadEntity | LineEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));
  return layer?.locked === true;
}

function previewIdFactory(sourceEntity: CadEntity, _offset: { x: number; y: number }, sequence: number): EntityId {
  // O id de preview marca explicitamente as entidades fantasmas para que o renderer possa diferencia-las se quiser.
  return `array_preview_${sourceEntity.id}_${sequence}`;
}

function buildLimitedPreviewEntities(
  sourceEntities: ReadonlyArray<CadEntity>,
  params: RectangularArrayParams,
  budget: number
): ReadonlyArray<CadEntity> {
  // O metodo gera as entidades fantasmas em ordem ate atingir o orcamento, evitando alocar arrays massivos.
  if (budget <= 0 || sourceEntities.length === 0) {
    return [];
  }

  const offsets = buildRectangularArrayOffsets(params);
  const limit = Math.min(offsets.length * sourceEntities.length, budget);
  const previewEntities: CadEntity[] = [];
  let sequence = 0;

  for (const offset of offsets) {
    if (previewEntities.length >= limit) {
      break;
    }

    for (const entity of sourceEntities) {
      if (previewEntities.length >= limit) {
        break;
      }

      previewEntities.push(cloneCadEntityWithOffset(entity, offset, previewIdFactory(entity, offset, sequence)));
      sequence += 1;
    }
  }

  return previewEntities;
}
