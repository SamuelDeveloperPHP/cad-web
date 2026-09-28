import {
  CompositeCommand,
  CreateEntityCommand,
  ReplaceEntitiesCommand,
  ReplaceEntityCommand,
  UpdateEntityCommand,
  type CadEntity,
  type DimensionEntity,
  type EntityId
} from "@cad-web/cad-core";
import {
  addVertexAtGrip,
  getDimensionGripPoints,
  getEntityGripPoints,
  gripVertexOptions,
  removeVertexAtGrip,
  supportsEntityGrips,
  updateDimensionByGrip,
  updateEntityByGrip,
  visualDegreesToWorldRadians,
  type GripEntityShape,
  type Point2D
} from "@cad-web/cad-geometry";
import type { CadTool, ToolMenuItem } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { parseDirectInput, resolveDirectInput } from "../draw/directInput";
import { newPieceId } from "../modify/curveEditUtils";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import { findNearestEntityId } from "./hitTesting";
import { boxSelectionMode, entitiesInSelectionBox } from "./boxSelection";
import {
  applyGripTransform,
  gripOperationLabel,
  gripTransformFromPoint,
  nextGripOperation,
  parseGripOperation,
  GRIP_OPERATIONS,
  type GripOperation,
  type GripTransform
} from "./gripOperations";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;
const GRIP_TOLERANCE_PIXELS = 10;
// Acima disso os grips das entidades selecionadas não são mostrados (seleções grandes ficam leves).
export const MAX_GRIP_ENTITIES = 50;
const BOX_DRAG_THRESHOLD_PIXELS = 4;
// Clique sem arrasto no grip (abaixo deste deslocamento) deixa o grip "quente", como no AutoCAD.
const GRIP_CLICK_THRESHOLD_PIXELS = 4;
// Teclas que o grip ativo reivindica antes dos atalhos globais (Delete apagaria a entidade; M abriria o Move).
const GRIP_KEYS: ReadonlySet<string> = new Set(["Delete", "Backspace", " ", "Enter", "a", "b", "c", "m", "r", "x"]);

type PendingSelection = Readonly<{
  startWorld: Point2D;
  startScreen: Point2D;
  entityUnderCursor: EntityId | null;
  boxing: boolean;
}>;

// Entidades com grips editáveis: cotas (seleção única) e as geometrias com grips do kernel.
type GripEntity = CadEntity;

type GripHit = Readonly<{
  entity: GripEntity;
  gripId: string;
  point: Point2D;
  locked: boolean;
}>;

/**
 * Grip em edição. documentEntity é a entidade do documento (alvo do Stretch); baseEntity é a entidade de
 * onde o Stretch é calculado (difere dela depois de inserir um vértice). targets são as entidades selecionadas
 * (em camadas utilizáveis) que Move/Rotate/Scale/Mirror transformam. No phase "dragging" o botão está
 * pressionado; no "hot" o grip segue o cursor até o próximo clique ou valor digitado.
 */
type GripEditState = Readonly<{
  documentEntity: GripEntity;
  baseEntity: GripEntity;
  gripId: string;
  gripPoint: Point2D;
  basePoint: Point2D;
  downScreen: Point2D;
  lastPoint: Point2D;
  phase: "dragging" | "hot";
  operation: GripOperation;
  targets: ReadonlyArray<CadEntity>;
  copy: boolean;
  awaitingBasePoint: boolean;
}>;

export class SelectTool implements CadTool {
  readonly id = "select";
  readonly name = "Select";
  readonly aliases = ["sel", "select"];

  private grip: GripEditState | null = null;
  private suppressNextPointerUp = false;
  private pending: PendingSelection | null = null;

  activate(context: ToolContext): void {
    context.showMessage("Select entity or drag a selection window.");
  }

  deactivate(context: ToolContext): void {
    this.grip = null;
    this.pending = null;
    this.suppressNextPointerUp = false;
    context.clearPreview();
  }

  claimsKeyDown(event: ToolKeyboardEvent): boolean {
    return this.grip !== null && !event.ctrlKey && !event.metaKey && (GRIP_KEYS.has(event.key) || GRIP_KEYS.has(event.key.toLowerCase()));
  }

  claimsCommandInput(_input: string): boolean {
    return this.grip !== null;
  }

  getContextMenu(): ReadonlyArray<ToolMenuItem> | null {
    const grip = this.grip;

    if (grip === null) {
      return null;
    }

    const vertex = grip.operation === "stretch" ? vertexOptionsOf(grip) : { canAdd: false, canRemove: false };
    const items: ToolMenuItem[] = GRIP_OPERATIONS.map((operation) => ({
      label: gripOperationLabel(operation),
      command: operation,
      checked: grip.operation === operation
    }));

    items.push(
      { label: "Base Point", command: "base", separatorBefore: true },
      { label: "Copy", command: "copy", checked: grip.copy }
    );

    if (vertex.canAdd || vertex.canRemove) {
      items.push(
        { label: "Add Vertex", command: "add", disabled: !vertex.canAdd, separatorBefore: true },
        { label: "Remove Vertex", command: "remove", disabled: !vertex.canRemove }
      );
    }

    items.push({ label: "Exit", command: "exit", separatorBefore: true });
    return items;
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.grip !== null) {
      // O botão direito fica para o menu de contexto do grip.
      if (event.button !== "primary") {
        return TOOL_RESULT_NONE;
      }

      // Grip quente: o clique define o ponto base (opção Base point) ou o ponto da operação.
      if (this.grip.phase === "hot") {
        this.suppressNextPointerUp = true;
        return this.acceptPoint(resolveSnappedPoint(event, context), context);
      }
    }

    const gripHit = findGripHit(context, event);

    if (gripHit !== null) {
      if (gripHit.locked) {
        context.showMessage("[Grip] Layer is locked.");
        return TOOL_RESULT_NONE;
      }

      this.grip = {
        documentEntity: gripHit.entity,
        baseEntity: gripHit.entity,
        gripId: gripHit.gripId,
        gripPoint: gripHit.point,
        basePoint: gripHit.point,
        downScreen: event.screenPoint,
        lastPoint: gripHit.point,
        phase: "dragging",
        operation: "stretch",
        targets: usableSelection(context, gripHit.entity),
        copy: false,
        awaitingBasePoint: false
      };

      const preview: CadPreview = { type: "ghostEntities", entities: [gripHit.entity] };
      context.setPreview(preview);
      context.showMessage(gripHit.entity.type === "dimension"
        ? "[Grip] Drag dimension grip. Release to update dimension. Press Esc to cancel."
        : `[Grip] Drag ${gripHit.entity.type} grip. Release to update. Press Esc to cancel.`);

      return { type: "preview", preview };
    }

    // A seleção é decidida no release: um clique seleciona a entidade sob o cursor; um arrasto vira janela.
    const entityUnderCursor = findNearestEntityId(context.document, {
      worldPoint: event.worldPoint,
      toleranceWorld: DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale
    });

    this.pending = {
      startWorld: event.worldPoint,
      startScreen: event.screenPoint,
      entityUnderCursor,
      boxing: false
    };

    return TOOL_RESULT_NONE;
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.grip !== null) {
      const point = resolveSnappedPoint(event, context);
      this.grip = { ...this.grip, lastPoint: point };
      return this.previewGrip(point, context);
    }

    if (this.pending !== null) {
      // A janela de seleção só começa após arrastar além do limiar e quando não há entidade sob o clique inicial.
      if (!this.pending.boxing) {
        const moved = Math.hypot(
          event.screenPoint.x - this.pending.startScreen.x,
          event.screenPoint.y - this.pending.startScreen.y
        );

        if (moved < BOX_DRAG_THRESHOLD_PIXELS || this.pending.entityUnderCursor !== null) {
          return TOOL_RESULT_NONE;
        }

        this.pending = { ...this.pending, boxing: true };
      }

      const mode = boxSelectionMode(this.pending.startWorld, event.worldPoint);
      const preview: CadPreview = {
        type: "selectionBox",
        start: this.pending.startWorld,
        end: event.worldPoint,
        mode
      };

      context.setPreview(preview);
      return { type: "preview", preview };
    }

    return TOOL_RESULT_NONE;
  }

  onPointerUp(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.suppressNextPointerUp) {
      this.suppressNextPointerUp = false;
      return TOOL_RESULT_NONE;
    }

    if (this.grip !== null && this.grip.phase === "dragging") {
      if (event.button !== "primary") {
        return TOOL_RESULT_NONE;
      }

      const moved = Math.hypot(event.screenPoint.x - this.grip.downScreen.x, event.screenPoint.y - this.grip.downScreen.y);

      // Clique sem arrasto: o grip fica quente e segue o cursor (clique, valor digitado ou opção define o ponto).
      if (moved < GRIP_CLICK_THRESHOLD_PIXELS) {
        this.grip = { ...this.grip, phase: "hot" };
        context.showMessage(gripPrompt(this.grip));
        return TOOL_RESULT_NONE;
      }

      return this.acceptPoint(resolveSnappedPoint(event, context), context);
    }

    if (this.grip !== null) {
      return TOOL_RESULT_NONE;
    }

    const pending = this.pending;
    this.pending = null;

    if (pending === null) {
      return TOOL_RESULT_NONE;
    }

    if (pending.boxing) {
      const mode = boxSelectionMode(pending.startWorld, event.worldPoint);
      const ids = entitiesInSelectionBox(context.document, pending.startWorld, event.worldPoint, mode);
      context.clearPreview();
      context.selectEntities(ids);
      context.showMessage(`${ids.length} entit${ids.length === 1 ? "y" : "ies"} selected (${mode}).`);
      return { type: "complete" };
    }

    if (pending.entityUnderCursor !== null) {
      context.selectEntities([pending.entityUnderCursor]);
      return { type: "message", message: `Selected ${pending.entityUnderCursor}.` };
    }

    context.clearSelection();
    return { type: "message", message: "Selection cleared." };
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      if (this.grip !== null) {
        return this.exitGrip(context, "[Grip] Edit canceled.");
      }

      if (this.pending !== null) {
        this.pending = null;
        context.clearPreview();
        return { type: "cancel" };
      }

      context.clearSelection();
      return { type: "cancel" };
    }

    if (this.grip === null) {
      return TOOL_RESULT_NONE;
    }

    const key = event.key.toLowerCase();

    // Espaço/Enter alternam o modo, como no AutoCAD; as letras são atalhos das opções do grip.
    if (key === " " || key === "enter") return this.setOperation(nextGripOperation(this.grip.operation), context);
    if (key === "m") return this.setOperation("move", context);
    if (key === "b") return this.requestBasePoint(context);
    if (key === "c") return this.toggleCopy(context);
    if (key === "x") return this.exitGrip(context, "[Grip] Exit.");
    if (key === "a") return this.addVertex(context);
    if (key === "r" || key === "delete" || key === "backspace") return this.removeVertex(context);

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const grip = this.grip;

    if (grip === null) {
      return TOOL_RESULT_NONE;
    }

    const command = input.trim().toLowerCase();
    const operation = parseGripOperation(command);

    if (command.length === 0) return this.setOperation(nextGripOperation(grip.operation), context);
    if (operation !== null) return this.setOperation(operation, context);
    if (command === "b" || command === "base") return this.requestBasePoint(context);
    if (command === "c" || command === "copy") return this.toggleCopy(context);
    if (command === "x" || command === "exit") return this.exitGrip(context, "[Grip] Exit.");
    if (command === "a" || command === "add") return this.addVertex(context);
    if (command === "r" || command === "remove" || command === "del" || command === "delete") return this.removeVertex(context);

    // Rotate e Scale aceitam o valor direto: ângulo em graus (convenção do AutoCAD, anti-horário) e fator.
    const value = Number(command);

    if (!grip.awaitingBasePoint && command.length > 0 && Number.isFinite(value)) {
      if (grip.operation === "rotate") {
        return this.commitTransform({ kind: "rotate", angle: visualDegreesToWorldRadians(value) }, context);
      }

      if (grip.operation === "scale") {
        if (!(value > 0)) return this.inputError(context, "[Grip] Scale factor must be greater than zero.");
        return this.commitTransform({ kind: "scale", factor: value }, context);
      }
    }

    // Pontos na unidade de trabalho: x,y absoluto; @dx,dy e @d<a relativos ao ponto base;
    // uma distância segue a direção do cursor a partir dele.
    const direction = { x: grip.lastPoint.x - grip.basePoint.x, y: grip.lastPoint.y - grip.basePoint.y };
    const point = resolveDirectInput(
      parseDirectInput(input),
      grip.basePoint,
      Math.hypot(direction.x, direction.y) > 0 ? direction : null,
      context.unitScale
    );

    if (point === null) {
      return this.inputError(context, "[Grip] Invalid input. Type a point (x,y, @dx,dy, @d<a), a value or an option.");
    }

    return this.acceptPoint(point, context);
  }

  // ----------------------------------------------------------------------------------------------
  // Operações
  // ----------------------------------------------------------------------------------------------

  private acceptPoint(point: Point2D, context: ToolContext): ToolResult {
    const grip = this.grip;

    if (grip === null) {
      return TOOL_RESULT_NONE;
    }

    if (grip.awaitingBasePoint) {
      this.grip = { ...grip, basePoint: point, lastPoint: point, awaitingBasePoint: false, phase: "hot" };
      context.showMessage(gripPrompt(this.grip));
      return this.previewGrip(point, context);
    }

    if (grip.operation === "stretch") {
      return this.commitStretch(point, context);
    }

    const transform = gripTransformFromPoint(grip.operation, grip.basePoint, point, context.unitScale);
    return transform === null ? this.inputError(context, "[Grip] The point coincides with the base point.") : this.commitTransform(transform, context);
  }

  private previewGrip(point: Point2D, context: ToolContext): ToolResult {
    const grip = this.grip;

    if (grip === null) {
      return TOOL_RESULT_NONE;
    }

    if (grip.awaitingBasePoint) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    let entities: ReadonlyArray<CadEntity> | null;

    if (grip.operation === "stretch") {
      const stretched = stretchGrip(grip, point);
      entities = stretched === null ? null : [stretched];
    } else {
      const transform = gripTransformFromPoint(grip.operation, grip.basePoint, point, context.unitScale);
      entities = transform === null ? null : applyGripTransform(grip.targets, grip.basePoint, transform);
    }

    // Geometria degenerada (ex.: arco por três pontos alinhados): mantém o último preview válido.
    if (entities === null) {
      return TOOL_RESULT_NONE;
    }

    const preview: CadPreview = { type: "ghostEntities", entities: [...entities, rubberBand(grip.basePoint, point, grip.documentEntity.layerId)] };
    context.setPreview(preview);
    return { type: "preview", preview };
  }

  private commitStretch(point: Point2D, context: ToolContext): ToolResult {
    const grip = this.grip!;
    const updated = stretchGrip(grip, point);

    if (updated === null) {
      return this.inputError(context, "[Grip] Invalid geometry for this point.");
    }

    if (grip.copy && updated.type !== "dimension") {
      return this.commitCopies([updated], context);
    }

    this.grip = null;
    return this.executeStretch(grip.documentEntity, updated, context);
  }

  private commitTransform(transform: GripTransform, context: ToolContext): ToolResult {
    const grip = this.grip!;
    const transformed = applyGripTransform(grip.targets, grip.basePoint, transform);

    if (transformed.length === 0) {
      return this.inputError(context, "[Grip] Nothing to transform.");
    }

    if (grip.copy) {
      return this.commitCopies(transformed, context);
    }

    const originals = grip.targets.filter((entity) => transformed.some((updated) => updated.id === entity.id));
    const previousSelection = context.selection.entityIds;
    context.executeCommand(new ReplaceEntitiesCommand(originals, transformed, `${gripOperationLabel(grip.operation)}s entities by grip.`));
    context.selectEntities(previousSelection);
    context.clearPreview();
    context.showMessage(`[Grip] ${gripOperationLabel(grip.operation)}: ${transformed.length} entit${transformed.length === 1 ? "y" : "ies"}.`);
    this.grip = null;
    return { type: "complete" };
  }

  // Cópias (opção Copy): as entidades transformadas entram com ids novos e o grip continua ativo.
  private commitCopies(entities: ReadonlyArray<CadEntity>, context: ToolContext): ToolResult {
    const copies = entities.map((entity) => ({ ...entity, id: newPieceId(entity.id, "copy") }) as CadEntity);
    context.executeCommand(new CompositeCommand(copies.map((entity) => new CreateEntityCommand(entity)), "Copies entities by grip."));
    this.grip = { ...this.grip!, phase: "hot" };
    context.showMessage(`[Grip] ${copies.length} cop${copies.length === 1 ? "y" : "ies"} created. ${gripPrompt(this.grip)}`);
    return this.previewGrip(this.grip.lastPoint, context);
  }

  private executeStretch(original: GripEntity, updated: GripEntity, context: ToolContext): ToolResult {
    const previousSelection = context.selection.entityIds;

    if (updated.type === "dimension") {
      context.executeCommand(new UpdateEntityCommand(updated.id, {
        definition: updated.definition
      } as Partial<DimensionEntity>));
      context.selectEntities([updated.id]);
      context.showMessage("[Grip] Dimension updated.");
    } else {
      context.executeCommand(new ReplaceEntityCommand(original, [updated], `Edits a ${updated.type} by grip.`));
      // A seleção continua a mesma (os grips das outras entidades selecionadas seguem visíveis).
      context.selectEntities(previousSelection.includes(updated.id) ? previousSelection : [updated.id]);
      context.showMessage(`[Grip] ${capitalize(updated.type)} updated.`);
    }

    context.clearPreview();
    return { type: "complete" };
  }

  private setOperation(operation: GripOperation, context: ToolContext): ToolResult {
    if (this.grip === null) {
      return TOOL_RESULT_NONE;
    }

    this.grip = { ...this.grip, operation, phase: "hot" };
    this.suppressNextPointerUp = false;
    context.showMessage(gripPrompt(this.grip));
    return this.previewGrip(this.grip.lastPoint, context);
  }

  private requestBasePoint(context: ToolContext): ToolResult {
    if (this.grip === null) {
      return TOOL_RESULT_NONE;
    }

    this.grip = { ...this.grip, awaitingBasePoint: true, phase: "hot" };
    context.clearPreview();
    context.showMessage("[Grip] Specify base point (click or x,y).");
    return TOOL_RESULT_NONE;
  }

  private toggleCopy(context: ToolContext): ToolResult {
    if (this.grip === null) {
      return TOOL_RESULT_NONE;
    }

    this.grip = { ...this.grip, copy: !this.grip.copy, phase: "hot" };
    context.showMessage(gripPrompt(this.grip));
    return this.previewGrip(this.grip.lastPoint, context);
  }

  private exitGrip(context: ToolContext, message: string): ToolResult {
    this.grip = null;
    this.suppressNextPointerUp = false;
    context.clearPreview();
    context.showMessage(message);
    return { type: "cancel" };
  }

  private inputError(context: ToolContext, message: string): ToolResult {
    context.showMessage(message);
    return { type: "error", message };
  }

  // Insere um vértice após o grip (polyline ou ponto de ajuste) e passa a editar o vértice novo.
  private addVertex(context: ToolContext): ToolResult {
    const grip = this.grip;

    if (grip === null || grip.operation !== "stretch" || !vertexOptionsOf(grip).canAdd) {
      return this.vertexUnavailable(context, "add");
    }

    const added = addVertexAtGrip(grip.baseEntity as GripEntityShape, grip.gripId, grip.lastPoint)!;
    this.grip = {
      ...grip,
      baseEntity: added.entity as unknown as GripEntity,
      gripId: added.gripId,
      gripPoint: grip.lastPoint,
      basePoint: grip.lastPoint,
      phase: "hot"
    };
    this.suppressNextPointerUp = grip.phase === "dragging";
    context.showMessage("[Grip] Vertex added. Click or type the new vertex position. Press Esc to cancel.");
    return this.previewGrip(grip.lastPoint, context);
  }

  private removeVertex(context: ToolContext): ToolResult {
    const grip = this.grip;

    if (grip === null || grip.operation !== "stretch" || !supportsEntityGrips(grip.baseEntity)) {
      return this.vertexUnavailable(context, "remove");
    }

    const updated = removeVertexAtGrip(grip.baseEntity as GripEntityShape, grip.gripId);

    if (updated === null) {
      return this.vertexUnavailable(context, "remove");
    }

    this.grip = null;
    this.suppressNextPointerUp = grip.phase === "dragging";
    return this.executeStretch(grip.documentEntity, updated as unknown as GripEntity, context);
  }

  private vertexUnavailable(context: ToolContext, action: "add" | "remove"): ToolResult {
    const message = this.grip !== null && this.grip.operation !== "stretch"
      ? "[Grip] Vertex options are available in Stretch mode."
      : action === "add"
        ? "[Grip] Add vertex works on polyline vertices, polyline segment midpoints and spline fit points."
        : "[Grip] Remove vertex works on polyline vertices and spline fit points (keeping the minimum count).";
    return this.inputError(context, message);
  }
}

// Stretch: o grip vai para gripPoint + (ponto − base); com a base no próprio grip, o grip vai ao ponto.
function stretchGrip(grip: GripEditState, point: Point2D): GripEntity | null {
  const target = { x: grip.gripPoint.x + point.x - grip.basePoint.x, y: grip.gripPoint.y + point.y - grip.basePoint.y };

  if (grip.baseEntity.type === "dimension") {
    return updateDimensionByGrip(grip.baseEntity as any, grip.gripId, target) as DimensionEntity;
  }

  if (!supportsEntityGrips(grip.baseEntity)) {
    return null;
  }

  return updateEntityByGrip(grip.baseEntity as GripEntityShape, grip.gripId, target) as unknown as GripEntity | null;
}

function vertexOptionsOf(grip: GripEditState): Readonly<{ canAdd: boolean; canRemove: boolean }> {
  return supportsEntityGrips(grip.baseEntity)
    ? gripVertexOptions(grip.baseEntity as GripEntityShape, grip.gripId)
    : { canAdd: false, canRemove: false };
}

function gripPrompt(grip: GripEditState): string {
  const vertex = grip.operation === "stretch" ? vertexOptionsOf(grip) : { canAdd: false, canRemove: false };
  const request: Readonly<Record<GripOperation, string>> = {
    stretch: "Specify stretch point",
    move: "Specify move point",
    rotate: "Specify rotation angle",
    scale: "Specify scale factor",
    mirror: "Specify second point"
  };
  const options = [
    "Base point (B)",
    "Copy (C)",
    vertex.canAdd ? "Add vertex (A)" : null,
    vertex.canRemove ? "Remove vertex (R)" : null,
    "eXit (X)"
  ].filter((option) => option !== null);
  const title = `** ${grip.operation.toUpperCase()}${grip.copy ? " (multiple)" : ""} **`;
  return `[Grip] ${title} ${request[grip.operation]} or [${options.join(" / ")}]. Space: next mode.`;
}

// Linha elástica do ponto base ao cursor, desenhada junto do preview (como no AutoCAD).
function rubberBand(from: Point2D, to: Point2D, layerId: string): CadEntity {
  return { id: "grip_rubber_band", layerId, type: "line", start: from, end: to };
}

// Selecionadas em camadas visíveis e desbloqueadas; a entidade do grip entra mesmo fora da seleção.
function usableSelection(context: ToolContext, gripEntity: GripEntity): ReadonlyArray<CadEntity> {
  const selected = new Set([...context.selection.entityIds, gripEntity.id]);
  const usableLayers = new Set(context.document.layers.filter((layer) => layer.visible !== false && layer.locked !== true).map((layer) => layer.id));
  return context.document.entities.filter((entity) => selected.has(entity.id) && (usableLayers.has(entity.layerId) || entity.layerId === ""));
}

// Entidades selecionadas cujos grips estão visíveis: a cota da seleção única ou as entidades com grips.
export function gripEntitiesOfSelection(document: ToolContext["document"], selectedIds: ReadonlyArray<EntityId>): ReadonlyArray<GripEntity> {
  const selected = new Set(selectedIds);
  const entities = document.entities.filter((entity) => selected.has(entity.id));

  if (entities.length === 1 && entities[0]!.type === "dimension") {
    return [entities[0]!];
  }

  const editable = entities.filter((entity) => supportsEntityGrips(entity));
  return editable.length <= MAX_GRIP_ENTITIES ? editable : [];
}

function gripsOf(entity: GripEntity): ReadonlyArray<Readonly<{ id: string; point: Point2D }>> {
  if (entity.type === "dimension") {
    return getDimensionGripPoints(entity as any);
  }

  return supportsEntityGrips(entity) ? getEntityGripPoints(entity as GripEntityShape) : [];
}

function findGripHit(context: ToolContext, event: ToolPointerEvent): GripHit | null {
  let nearest: GripHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of gripEntitiesOfSelection(context.document, context.selection.entityIds)) {
    const layer = context.document.layers.find((candidate) => candidate.id === entity.layerId);

    if (layer?.visible === false) {
      continue;
    }

    for (const grip of gripsOf(entity)) {
      const gripScreenPoint = worldToScreenPoint(grip.point, context.viewport);
      const gripDistance = distanceBetweenScreenPoints(event.screenPoint, gripScreenPoint);

      if (gripDistance <= GRIP_TOLERANCE_PIXELS && gripDistance < nearestDistance) {
        nearest = { entity, gripId: grip.id, point: grip.point, locked: layer?.locked === true };
        nearestDistance = gripDistance;
      }
    }
  }

  return nearest;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function worldToScreenPoint(point: Point2D, viewport: ToolContext["viewport"]): Point2D {
  return {
    x: (point.x - viewport.origin.x) * viewport.scale,
    y: (point.y - viewport.origin.y) * viewport.scale
  };
}

function distanceBetweenScreenPoints(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
