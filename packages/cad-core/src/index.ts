import { addVector, rotationMatrix, scaleMatrix, transformPoint, type Point2D } from "@cad-web/cad-geometry";
import { createDimensionStyleFromPreset, getDimensionStylePresetById } from "./dimensionStylePresets";

export type EntityId = string;

export type BaseEntity = Readonly<{
  id: EntityId;
  layerId: string;
  color?: string; // A entidade sobrescreve a cor da camada quando este valor existe.
  lineThickness?: number;
  lineType?: "solid" | "dashed" | "dotted";
}>;

export type LineEntity = BaseEntity & Readonly<{
  type: "line";
  start: Point2D;
  end: Point2D;
}>;

export type RectangleEntity = BaseEntity & Readonly<{
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}>;

export type CircleEntity = BaseEntity & Readonly<{
  type: "circle";
  center: Point2D;
  radius: number;
}>;

export type ArcEntity = BaseEntity & Readonly<{
  type: "arc";
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
}>;

export type PolylineEntity = BaseEntity & Readonly<{
  type: "polyline";
  vertices: ReadonlyArray<Point2D>;
}>;

export interface DimensionStyle {
  id: string;
  name: string;
  textHeight: number;
  arrowSize: number;
  extensionOffset: number;
  extensionOvershoot: number;
  precision: number;
  unitSuffix: string;
  arrowType: "tick" | "arrow";
  color?: string;
  textColor?: string;
  lineColor?: string;
  scale?: number;
  presetId?: string;
  isDefault?: boolean;
}

export type LinearDimensionDef = Readonly<{
  firstPoint: Point2D;
  secondPoint: Point2D;
  dimensionLinePoint: Point2D;
  orientation: "horizontal" | "vertical" | "auto";
}>;

export type AlignedDimensionDef = Readonly<{
  firstPoint: Point2D;
  secondPoint: Point2D;
  dimensionLinePoint: Point2D;
}>;

export type RadiusDimensionDef = Readonly<{
  targetEntityId?: string;
  center: Point2D;
  radius: number;
  leaderEndPoint: Point2D;
}>;

export type DiameterDimensionDef = Readonly<{
  targetEntityId?: string;
  center: Point2D;
  radius: number;
  leaderEndPoint: Point2D;
}>;

export type AngularDimensionDef = Readonly<{
  firstLineId?: string;
  secondLineId?: string;
  vertex: Point2D;
  firstPoint: Point2D;
  secondPoint: Point2D;
  arcPoint: Point2D;
}>;

export type DimensionEntity = BaseEntity & Readonly<{
  type: "dimension";
  dimensionType: "linear" | "aligned" | "radius" | "diameter" | "angular";
  dimensionStyleId?: string;
  styleOverride?: Partial<DimensionStyle>;
  style?: Partial<DimensionStyle>; // O campo legado mantém compatibilidade com documentos anteriores.
  definition: LinearDimensionDef | AlignedDimensionDef | RadiusDimensionDef | DiameterDimensionDef | AngularDimensionDef;
  textOverride?: string;
}>;

export type CadEntity = LineEntity | RectangleEntity | CircleEntity | ArcEntity | DimensionEntity;

export type CadLayer = Readonly<{
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  opacity?: number;
  order: number;
}>;

export type CadDisplayUnit = "um" | "mm" | "cm" | "m" | "km";

export type CadDocument = Readonly<{
  schemaVersion: string;
  id: string;
  units: "mm" | "cm" | "m" | "in";
  displayUnit?: CadDisplayUnit;
  entities: ReadonlyArray<CadEntity>;
  layers: ReadonlyArray<CadLayer>;
  activeLayerId: string;
  dimensionStyles: ReadonlyArray<DimensionStyle>;
  activeDimensionStyleId: string;
}>;

export interface CadCommand {
  readonly id: string;
  readonly type: string;
  readonly description: string;

  execute(document: CadDocument): CadDocument;
  undo(document: CadDocument): CadDocument;
}

export function createEmptyDocument(id: string): CadDocument {
  const standardStyle: DimensionStyle = {
    id: "dimstyle_standard",
    name: "Standard",
    textHeight: 12,
    arrowSize: 6,
    extensionOffset: 2,
    extensionOvershoot: 3,
    precision: 2,
    unitSuffix: " mm",
    arrowType: "tick",
    isDefault: true
  };

  return {
    schemaVersion: "1.0.0",
    id,
    units: "mm",
    entities: [],
    layers: [
      {
        id: "layer_0",
        name: "Layer 0",
        color: "#ffffff",
        visible: true,
        locked: false,
        order: 0
      }
    ],
    activeLayerId: "layer_0",
    dimensionStyles: [standardStyle],
    activeDimensionStyleId: "dimstyle_standard"
  };
}

export class CommandHistory {
  private document: CadDocument;
  private readonly undoStack: CadCommand[] = [];
  private readonly redoStack: CadCommand[] = [];

  constructor(initialDocument: CadDocument) {
    this.document = initialDocument;
  }

  get currentDocument(): CadDocument {
    return this.document;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  execute(command: CadCommand): CadDocument {
    this.document = command.execute(this.document);
    this.undoStack.push(command);
    this.redoStack.length = 0;

    return this.document;
  }

  undo(): CadDocument {
    const command = this.undoStack.pop();

    if (command === undefined) {
      return this.document;
    }

    this.document = command.undo(this.document);
    this.redoStack.push(command);

    return this.document;
  }

  redo(): CadDocument {
    const command = this.redoStack.pop();

    if (command === undefined) {
      return this.document;
    }

    this.document = command.execute(this.document);
    this.undoStack.push(command);

    return this.document;
  }

  replaceDocument(document: CadDocument): void {
    this.document = document;
    this.clear();
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

export class CreateEntityCommand implements CadCommand {
  readonly type = "CreateEntityCommand";
  readonly description = "Creates CAD entity.";

  constructor(readonly entity: CadEntity) {}

  get id(): string {
    return `cmd_create_${this.entity.id}`;
  }

  execute(document: CadDocument): CadDocument {
    return {
      ...document,
      entities: [...document.entities, this.entity]
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== this.entity.id)
    };
  }
}

export class DeleteEntitiesCommand implements CadCommand {
  readonly type = "DeleteEntitiesCommand";
  readonly description = "Deletes selected CAD entities.";
  private deletedEntities: ReadonlyArray<CadEntity> = [];

  constructor(readonly entityIds: ReadonlyArray<EntityId>) {}

  get id(): string {
    return `cmd_delete_${this.entityIds.join("_")}`;
  }

  execute(document: CadDocument): CadDocument {
    const selectedIds = new Set(this.entityIds);
    this.deletedEntities = document.entities.filter((entity) => selectedIds.has(entity.id));

    return {
      ...document,
      entities: document.entities.filter((entity) => !selectedIds.has(entity.id))
    };
  }

  undo(document: CadDocument): CadDocument {
    const existingIds = new Set(document.entities.map((entity) => entity.id));
    const restoredEntities = this.deletedEntities.filter((entity) => !existingIds.has(entity.id));

    return {
      ...document,
      entities: [...document.entities, ...restoredEntities]
    };
  }
}

export class MoveEntitiesCommand implements CadCommand {
  readonly type = "MoveEntitiesCommand";
  readonly description = "Moves selected CAD entities.";

  constructor(
    readonly entityIds: ReadonlyArray<EntityId>,
    readonly displacement: Point2D
  ) {}

  get id(): string {
    return `cmd_move_${this.entityIds.join("_")}`;
  }

  execute(document: CadDocument): CadDocument {
    return moveEntities(document, this.entityIds, this.displacement);
  }

  undo(document: CadDocument): CadDocument {
    return moveEntities(document, this.entityIds, {
      x: -this.displacement.x,
      y: -this.displacement.y
    });
  }
}

export class RotateEntitiesCommand implements CadCommand {
  readonly type = "RotateEntitiesCommand";
  readonly description = "Rotates selected CAD entities.";

  constructor(
    readonly entityIds: ReadonlyArray<EntityId>,
    readonly pivot: Point2D,
    readonly angleRadians: number
  ) {}

  get id(): string {
    return `cmd_rotate_${this.entityIds.join("_")}`;
  }

  execute(document: CadDocument): CadDocument {
    return rotateEntities(document, this.entityIds, this.pivot, this.angleRadians);
  }

  undo(document: CadDocument): CadDocument {
    return rotateEntities(document, this.entityIds, this.pivot, -this.angleRadians);
  }
}

export class ScaleEntitiesCommand implements CadCommand {
  readonly type = "ScaleEntitiesCommand";
  readonly description = "Scales selected CAD entities.";

  constructor(
    readonly entityIds: ReadonlyArray<EntityId>,
    readonly pivot: Point2D,
    readonly factor: number
  ) {
    assertPositiveScaleFactor(factor);
  }

  get id(): string {
    return `cmd_scale_${this.entityIds.join("_")}`;
  }

  execute(document: CadDocument): CadDocument {
    return scaleEntities(document, this.entityIds, this.pivot, this.factor);
  }

  undo(document: CadDocument): CadDocument {
    return scaleEntities(document, this.entityIds, this.pivot, 1 / this.factor);
  }
}

export class ClearDocumentCommand implements CadCommand {
  readonly id = "cmd_clear_document";
  readonly type = "ClearDocumentCommand";
  readonly description = "Clears CAD document.";
  private previousEntities: ReadonlyArray<CadEntity> = [];

  execute(document: CadDocument): CadDocument {
    this.previousEntities = document.entities;

    return {
      ...document,
      entities: []
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      entities: this.previousEntities
    };
  }
}

export class CreateLayerCommand implements CadCommand {
  readonly type = "CreateLayerCommand";
  readonly description = "Creates a new layer.";

  constructor(readonly layer: CadLayer) {}

  get id(): string {
    return `cmd_create_layer_${this.layer.id}`;
  }

  execute(document: CadDocument): CadDocument {
    return {
      ...document,
      layers: [...document.layers, this.layer]
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      layers: document.layers.filter((l) => l.id !== this.layer.id)
    };
  }
}

export class RenameLayerCommand implements CadCommand {
  readonly type = "RenameLayerCommand";
  readonly description = "Renames a layer.";
  private oldName: string = "";

  constructor(
    readonly layerId: string,
    readonly newName: string
  ) {}

  get id(): string {
    return `cmd_rename_layer_${this.layerId}`;
  }

  execute(document: CadDocument): CadDocument {
    const layer = document.layers.find((l) => l.id === this.layerId);
    if (layer) {
      this.oldName = layer.name;
    }

    return {
      ...document,
      layers: document.layers.map((l) =>
        l.id === this.layerId ? { ...l, name: this.newName } : l
      )
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      layers: document.layers.map((l) =>
        l.id === this.layerId ? { ...l, name: this.oldName } : l
      )
    };
  }
}

export class DeleteLayerCommand implements CadCommand {
  readonly type = "DeleteLayerCommand";
  readonly description = "Deletes a layer.";
  private deletedLayer: CadLayer | undefined;
  private previousActiveLayerId: string = "layer_0";
  private entitiesMovedToLayer0: ReadonlyArray<string> = [];

  constructor(readonly layerId: string) {}

  get id(): string {
    return `cmd_delete_layer_${this.layerId}`;
  }

  execute(document: CadDocument): CadDocument {
    if (this.layerId === "layer_0") {
      return document; // O comando preserva a camada base layer_0.
    }

    this.deletedLayer = document.layers.find((l) => l.id === this.layerId);
    if (!this.deletedLayer) return document;

    this.previousActiveLayerId = document.activeLayerId;
    const newActiveLayerId = document.activeLayerId === this.layerId ? "layer_0" : document.activeLayerId;

    const entitiesToMove = document.entities.filter((e) => e.layerId === this.layerId);
    this.entitiesMovedToLayer0 = entitiesToMove.map((e) => e.id);
    const movedIds = new Set(this.entitiesMovedToLayer0);

    return {
      ...document,
      activeLayerId: newActiveLayerId,
      layers: document.layers.filter((l) => l.id !== this.layerId),
      entities: document.entities.map((e) =>
        movedIds.has(e.id) ? { ...e, layerId: "layer_0" } : e
      )
    };
  }

  undo(document: CadDocument): CadDocument {
    if (!this.deletedLayer) return document;

    const movedIds = new Set(this.entitiesMovedToLayer0);

    return {
      ...document,
      activeLayerId: this.previousActiveLayerId,
      layers: [...document.layers, this.deletedLayer].sort((a, b) => a.order - b.order),
      entities: document.entities.map((e) =>
        movedIds.has(e.id) ? { ...e, layerId: this.layerId } : e
      )
    };
  }
}

export class ChangeLayerColorCommand implements CadCommand {
  readonly type = "ChangeLayerColorCommand";
  readonly description = "Changes a layer's color.";
  private oldColor: string = "";

  constructor(
    readonly layerId: string,
    readonly newColor: string
  ) {}

  get id(): string {
    return `cmd_change_color_layer_${this.layerId}`;
  }

  execute(document: CadDocument): CadDocument {
    const layer = document.layers.find((l) => l.id === this.layerId);
    if (layer) {
      this.oldColor = layer.color;
    }

    return {
      ...document,
      layers: document.layers.map((l) =>
        l.id === this.layerId ? { ...l, color: this.newColor } : l
      )
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      layers: document.layers.map((l) =>
        l.id === this.layerId ? { ...l, color: this.oldColor } : l
      )
    };
  }
}

export class ToggleLayerVisibilityCommand implements CadCommand {
  readonly type = "ToggleLayerVisibilityCommand";
  readonly description = "Toggles layer visibility.";

  constructor(
    readonly layerId: string,
    readonly visible: boolean
  ) {}

  get id(): string {
    return `cmd_toggle_vis_layer_${this.layerId}`;
  }

  execute(document: CadDocument): CadDocument {
    return {
      ...document,
      layers: document.layers.map((l) =>
        l.id === this.layerId ? { ...l, visible: this.visible } : l
      )
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      layers: document.layers.map((l) =>
        l.id === this.layerId ? { ...l, visible: !this.visible } : l
      )
    };
  }
}

export class ToggleLayerLockCommand implements CadCommand {
  readonly type = "ToggleLayerLockCommand";
  readonly description = "Toggles layer lock state.";

  constructor(
    readonly layerId: string,
    readonly locked: boolean
  ) {}

  get id(): string {
    return `cmd_toggle_lock_layer_${this.layerId}`;
  }

  execute(document: CadDocument): CadDocument {
    return {
      ...document,
      layers: document.layers.map((l) =>
        l.id === this.layerId ? { ...l, locked: this.locked } : l
      )
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      layers: document.layers.map((l) =>
        l.id === this.layerId ? { ...l, locked: !this.locked } : l
      )
    };
  }
}

export class SetActiveLayerCommand implements CadCommand {
  readonly type = "SetActiveLayerCommand";
  readonly description = "Sets the active layer.";
  private previousActiveLayerId: string = "layer_0";

  constructor(readonly layerId: string) {}

  get id(): string {
    return `cmd_set_active_layer_${this.layerId}`;
  }

  execute(document: CadDocument): CadDocument {
    if (!document.layers.find((l) => l.id === this.layerId)) return document;
    
    this.previousActiveLayerId = document.activeLayerId;
    return {
      ...document,
      activeLayerId: this.layerId
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      activeLayerId: this.previousActiveLayerId
    };
  }
}

export class AddMultipleEntitiesCommand implements CadCommand {
  readonly id: string;
  readonly type = "AddMultipleEntitiesCommand";
  readonly description = "Adds multiple CAD entities in batch.";
  private addedEntityIds: ReadonlyArray<string>;

  constructor(readonly entities: ReadonlyArray<CadEntity>) {
    this.id = `cmd_add_multiple_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.addedEntityIds = entities.map((e) => e.id);
  }

  execute(document: CadDocument): CadDocument {
    // TODO: O modelo pode migrar esta clonagem para estrutura persistente se exigir imutabilidade profunda.
    // A evolução futura pode usar B-Tree ou mutabilidade interna controlada por flag.
    return {
      ...document,
      entities: document.entities.concat(this.entities)
    };
  }

  undo(document: CadDocument): CadDocument {
    const idsToRemove = new Set(this.addedEntityIds);
    return {
      ...document,
      entities: document.entities.filter((entity) => !idsToRemove.has(entity.id))
    };
  }
}

/**
 * Represents a command that updates the properties of a single entity.
 * It manages the original state to allow for undo operations.
 */
export class UpdateEntityCommand implements CadCommand {
  readonly type = "UpdateEntityCommand";
  readonly description = "Updates properties of an entity.";
  private oldEntity: CadEntity | undefined;

  constructor(
    readonly entityId: string,
    readonly patch: Partial<CadEntity>
  ) {}

  get id(): string {
    return `cmd_update_entity_${this.entityId}_${Date.now()}`;
  }

  /**
   * Executes the command, returning a new document state with the updated entity.
   */
  execute(document: CadDocument): CadDocument {
    const entityIndex = document.entities.findIndex((e) => e.id === this.entityId);
    if (entityIndex === -1) return document;

    this.oldEntity = document.entities[entityIndex];
    const newEntity = { ...this.oldEntity, ...this.patch } as CadEntity;

    const newEntities = [...document.entities];
    newEntities[entityIndex] = newEntity;

    return {
      ...document,
      entities: newEntities
    };
  }

  /**
   * Reverts the command, restoring the entity's previous properties.
   */
  undo(document: CadDocument): CadDocument {
    if (!this.oldEntity) return document;

    const entityIndex = document.entities.findIndex((e) => e.id === this.entityId);
    if (entityIndex === -1) return document;

    const newEntities = [...document.entities];
    newEntities[entityIndex] = this.oldEntity;

    return {
      ...document,
      entities: newEntities
    };
  }
}

export class UpdateEntitiesBatchCommand implements CadCommand {
  readonly type = "UpdateEntitiesBatchCommand";
  readonly description = "Updates properties of multiple entities in batch.";
  private oldEntities = new Map<string, CadEntity>();

  constructor(
    readonly entityIds: ReadonlyArray<string>,
    readonly patch: Partial<CadEntity>
  ) {}

  get id(): string {
    return `cmd_update_batch_${Date.now()}`;
  }

  execute(document: CadDocument): CadDocument {
    const idsToUpdate = new Set(this.entityIds);
    let changed = false;

    const newEntities = document.entities.map((entity) => {
      if (idsToUpdate.has(entity.id)) {
        this.oldEntities.set(entity.id, entity);
        changed = true;
        return { ...entity, ...this.patch } as CadEntity;
      }
      return entity;
    });

    if (!changed) return document;

    return {
      ...document,
      entities: newEntities
    };
  }

  undo(document: CadDocument): CadDocument {
    if (this.oldEntities.size === 0) return document;

    const newEntities = document.entities.map((entity) => {
      const oldEntity = this.oldEntities.get(entity.id);
      return oldEntity ? oldEntity : entity;
    });

    return {
      ...document,
      entities: newEntities
    };
  }
}

export class TrimLineCommand implements CadCommand {
  readonly type = "TrimLineCommand";
  readonly description = "Trims a line by replacing it with remaining segments.";
  private originalIndex = -1;

  constructor(
    readonly originalEntity: LineEntity,
    readonly resultEntities: ReadonlyArray<LineEntity>
  ) {}

  get id(): string {
    return `cmd_trim_line_${this.originalEntity.id}_${Date.now()}`;
  }

  execute(document: CadDocument): CadDocument {
    // O comando substitui a linha original pelos segmentos restantes em uma única troca imutável.
    const entityIndex = document.entities.findIndex((entity) => entity.id === this.originalEntity.id);

    if (entityIndex === -1) {
      return document;
    }

    this.originalIndex = entityIndex;

    return {
      ...document,
      entities: [
        ...document.entities.slice(0, entityIndex),
        ...this.resultEntities,
        ...document.entities.slice(entityIndex + 1)
      ]
    };
  }

  undo(document: CadDocument): CadDocument {
    // O undo remove os segmentos criados e reinsere a entidade original na posição anterior.
    const resultIds = new Set(this.resultEntities.map((entity) => entity.id));
    const entitiesWithoutTrimResult = document.entities.filter((entity) => !resultIds.has(entity.id));
    const insertionIndex = clampEntityIndex(this.originalIndex, entitiesWithoutTrimResult.length);

    return {
      ...document,
      entities: [
        ...entitiesWithoutTrimResult.slice(0, insertionIndex),
        this.originalEntity,
        ...entitiesWithoutTrimResult.slice(insertionIndex)
      ]
    };
  }
}

export class ExtendLineCommand implements CadCommand {
  readonly type = "ExtendLineCommand";
  readonly description = "Extends a line to a boundary.";

  constructor(
    readonly originalEntity: LineEntity,
    readonly updatedEntity: LineEntity,
    readonly endpoint: "start" | "end",
    readonly boundaryEntityId?: string
  ) {}

  get id(): string {
    return `cmd_extend_line_${this.originalEntity.id}_${Date.now()}`;
  }

  execute(document: CadDocument): CadDocument {
    // O comando mantém o mesmo ID para preservar seleção, snap, propriedades e serialização.
    return replaceLineEntity(document, this.originalEntity.id, this.updatedEntity);
  }

  undo(document: CadDocument): CadDocument {
    // O undo restaura exatamente a geometria original antes da extensão.
    return replaceLineEntity(document, this.originalEntity.id, this.originalEntity);
  }
}

export class FilletLineLineCommand implements CadCommand {
  readonly type = "FilletLineLineCommand";
  readonly description = "Creates a tangent arc between two lines.";

  constructor(
    readonly originalLine1: LineEntity,
    readonly originalLine2: LineEntity,
    readonly updatedLine1: LineEntity,
    readonly updatedLine2: LineEntity,
    readonly arcEntity: ArcEntity
  ) {}

  get id(): string {
    return `cmd_fillet_line_line_${this.originalLine1.id}_${this.originalLine2.id}_${Date.now()}`;
  }

  execute(document: CadDocument): CadDocument {
    // O comando atualiza as duas linhas e insere o arco real em uma unica transacao.
    const hasArc = document.entities.some((entity) => entity.id === this.arcEntity.id);

    return {
      ...document,
      entities: [
        ...document.entities.map((entity) => {
          if (entity.id === this.originalLine1.id) {
            return this.updatedLine1;
          }

          if (entity.id === this.originalLine2.id) {
            return this.updatedLine2;
          }

          return entity;
        }),
        ...(hasArc ? [] : [this.arcEntity])
      ]
    };
  }

  undo(document: CadDocument): CadDocument {
    // O undo restaura exatamente as linhas originais e remove o arco criado.
    return {
      ...document,
      entities: document.entities
        .filter((entity) => entity.id !== this.arcEntity.id)
        .map((entity) => {
          if (entity.id === this.originalLine1.id) {
            return this.originalLine1;
          }

          if (entity.id === this.originalLine2.id) {
            return this.originalLine2;
          }

          return entity;
        })
    };
  }
}

export class ChamferLineLineCommand implements CadCommand {
  readonly type = "ChamferLineLineCommand";
  readonly description = "Creates a chamfer line between two lines.";

  constructor(
    readonly originalLine1: LineEntity,
    readonly originalLine2: LineEntity,
    readonly updatedLine1: LineEntity,
    readonly updatedLine2: LineEntity,
    readonly chamferLine: LineEntity
  ) {}

  get id(): string {
    return `cmd_chamfer_line_line_${this.originalLine1.id}_${this.originalLine2.id}_${Date.now()}`;
  }

  execute(document: CadDocument): CadDocument {
    // O comando ajusta as duas linhas selecionadas e insere a linha de chanfro em uma unica transacao.
    const hasChamfer = document.entities.some((entity) => entity.id === this.chamferLine.id);

    return {
      ...document,
      entities: [
        ...document.entities.map((entity) => {
          if (entity.id === this.originalLine1.id) {
            return this.updatedLine1;
          }

          if (entity.id === this.originalLine2.id) {
            return this.updatedLine2;
          }

          return entity;
        }),
        ...(hasChamfer ? [] : [this.chamferLine])
      ]
    };
  }

  undo(document: CadDocument): CadDocument {
    // O undo restaura exatamente as linhas originais e remove a linha de chanfro criada.
    return {
      ...document,
      entities: document.entities
        .filter((entity) => entity.id !== this.chamferLine.id)
        .map((entity) => {
          if (entity.id === this.originalLine1.id) {
            return this.originalLine1;
          }

          if (entity.id === this.originalLine2.id) {
            return this.originalLine2;
          }

          return entity;
        })
    };
  }
}

function moveEntities(
  document: CadDocument,
  entityIds: ReadonlyArray<EntityId>,
  displacement: Point2D
): CadDocument {
  const selectedIds = new Set(entityIds);

  return {
    ...document,
    entities: document.entities.map((entity) =>
      selectedIds.has(entity.id) ? moveEntity(entity, displacement) : entity
    )
  };
}

function moveEntity(entity: CadEntity, displacement: Point2D): CadEntity {
  if (entity.type === "line") {
    return {
      ...entity,
      start: addVector(entity.start, displacement),
      end: addVector(entity.end, displacement)
    };
  }
  
  if (entity.type === "rectangle") {
    return {
      ...entity,
      x: entity.x + displacement.x,
      y: entity.y + displacement.y
    };
  }

  if (entity.type === "circle") {
    return {
      ...entity,
      center: addVector(entity.center, displacement)
    };
  }

  if (entity.type === "arc") {
    return {
      ...entity,
      center: addVector(entity.center, displacement)
    };
  }

  return entity;
}

function rotateEntities(
  document: CadDocument,
  entityIds: ReadonlyArray<EntityId>,
  pivot: Point2D,
  angleRadians: number
): CadDocument {
  const selectedIds = new Set(entityIds);

  return {
    ...document,
    entities: document.entities.map((entity) =>
      selectedIds.has(entity.id) ? rotateEntity(entity, pivot, angleRadians) : entity
    )
  };
}

export function rotateEntity(entity: CadEntity, pivot: Point2D, angleRadians: number): CadEntity {
  if (entity.type === "line") {
    const matrix = rotationMatrix(angleRadians, pivot);
    return {
      ...entity,
      start: transformPoint(entity.start, matrix),
      end: transformPoint(entity.end, matrix)
    };
  }

  if (entity.type === "rectangle") {
    // A rotação de retângulo aplica o pivô ao ponto base e soma o ângulo interno.
    const matrix = rotationMatrix(angleRadians, pivot);
    const origin = transformPoint({ x: entity.x, y: entity.y }, matrix);
    return {
      ...entity,
      x: origin.x,
      y: origin.y,
      rotation: (entity.rotation || 0) + angleRadians
    };
  }

  if (entity.type === "circle") {
    const matrix = rotationMatrix(angleRadians, pivot);
    return {
      ...entity,
      center: transformPoint(entity.center, matrix)
    };
  }

  // Entidades futuras como arc e polyline devem receber a transformação neste ponto.
  if (entity.type === "arc") {
    const matrix = rotationMatrix(angleRadians, pivot);
    return {
      ...entity,
      center: transformPoint(entity.center, matrix),
      startAngle: entity.startAngle + angleRadians,
      endAngle: entity.endAngle + angleRadians
    };
  }

  return entity;
}

function scaleEntities(
  document: CadDocument,
  entityIds: ReadonlyArray<EntityId>,
  pivot: Point2D,
  factor: number
): CadDocument {
  const selectedIds = new Set(entityIds);

  return {
    ...document,
    entities: document.entities.map((entity) =>
      selectedIds.has(entity.id) ? scaleEntity(entity, pivot, factor) : entity
    )
  };
}

export function scaleEntity(entity: CadEntity, pivot: Point2D, factor: number): CadEntity {
  assertPositiveScaleFactor(factor);

  const matrix = scaleMatrix(factor, factor, pivot);

  if (entity.type === "line") {
    return {
      ...entity,
      start: transformPoint(entity.start, matrix),
      end: transformPoint(entity.end, matrix)
    };
  }

  if (entity.type === "rectangle") {
    const origin = transformPoint({ x: entity.x, y: entity.y }, matrix);

    return {
      ...entity,
      x: origin.x,
      y: origin.y,
      width: entity.width * factor,
      height: entity.height * factor
    };
  }

  if (entity.type === "circle") {
    return {
      ...entity,
      center: transformPoint(entity.center, matrix),
      radius: entity.radius * factor
    };
  }

  if (entity.type === "arc") {
    return {
      ...entity,
      center: transformPoint(entity.center, matrix),
      radius: entity.radius * factor
    };
  }

  return entity;
}

function assertPositiveScaleFactor(factor: number): void {
  if (factor <= 0 || !Number.isFinite(factor)) {
    throw new Error("Scale factor must be greater than zero.");
  }
}

function clampEntityIndex(index: number, maxIndex: number): number {
  if (index < 0) {
    return maxIndex;
  }

  return Math.min(index, maxIndex);
}

function replaceLineEntity(document: CadDocument, entityId: string, line: LineEntity): CadDocument {
  const entityIndex = document.entities.findIndex((entity) => entity.id === entityId);

  if (entityIndex === -1) {
    return document;
  }

  const nextEntities = [...document.entities];
  nextEntities[entityIndex] = line;

  return {
    ...document,
    entities: nextEntities
  };
}

export function resolveDimensionStyle(document: CadDocument, entity: DimensionEntity): DimensionStyle {
  const defaultStyle: DimensionStyle = {
    id: "dimstyle_standard",
    name: "Standard",
    textHeight: 12,
    arrowSize: 6,
    extensionOffset: 2,
    extensionOvershoot: 3,
    precision: 2,
    unitSuffix: " mm",
    arrowType: "tick",
    isDefault: true
  };

  const styleId = entity.dimensionStyleId || "dimstyle_standard";
  let globalStyle = document.dimensionStyles?.find(s => s.id === styleId);

  if (!globalStyle) {
    globalStyle = document.dimensionStyles?.find(s => s.id === "dimstyle_standard") || defaultStyle;
  }

  // O resolvedor aplica a ordem global -> legado -> sobrescrita local.
  return {
    ...globalStyle,
    ...(entity.style || {}),
    ...(entity.styleOverride || {})
  };
}

export class CreateDimensionStyleCommand implements CadCommand {
  readonly type = "CreateDimensionStyleCommand";
  readonly description = "Creates a dimension style.";

  constructor(readonly style: DimensionStyle) {}

  get id(): string {
    return `cmd_create_dimstyle_${this.style.id}`;
  }

  execute(document: CadDocument): CadDocument {
    return {
      ...document,
      dimensionStyles: [...(document.dimensionStyles || []), this.style]
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      dimensionStyles: (document.dimensionStyles || []).filter(s => s.id !== this.style.id)
    };
  }
}

export type CreateDimensionStyleFromPresetCommandOptions = Readonly<{
  name?: string;
  setActive?: boolean;
}>;

export class CreateDimensionStyleFromPresetCommand implements CadCommand {
  readonly type = "CreateDimensionStyleFromPresetCommand";
  readonly description = "Creates a dimension style from a preset.";
  private createdStyle: DimensionStyle | undefined;
  private previousActiveStyleId: string | undefined;

  constructor(
    readonly presetId: string,
    readonly options: CreateDimensionStyleFromPresetCommandOptions = {}
  ) {}

  get id(): string {
    return `cmd_create_dimstyle_from_preset_${this.presetId}`;
  }

  execute(document: CadDocument): CadDocument {
    if (this.createdStyle === undefined) {
      this.createdStyle = createDimensionStyleFromPreset(this.presetId, {
        ...(this.options.name !== undefined ? { name: this.options.name } : {}),
        existingStyles: document.dimensionStyles || []
      });
    }

    if (this.createdStyle === undefined || document.dimensionStyles.some((style) => style.id === this.createdStyle?.id)) {
      return document;
    }

    this.previousActiveStyleId = document.activeDimensionStyleId;

    return {
      ...document,
      dimensionStyles: [...(document.dimensionStyles || []), this.createdStyle],
      activeDimensionStyleId: this.options.setActive === true ? this.createdStyle.id : document.activeDimensionStyleId
    };
  }

  undo(document: CadDocument): CadDocument {
    if (this.createdStyle === undefined) {
      return document;
    }

    return {
      ...document,
      dimensionStyles: (document.dimensionStyles || []).filter((style) => style.id !== this.createdStyle?.id),
      activeDimensionStyleId: this.previousActiveStyleId || document.activeDimensionStyleId
    };
  }
}

export type ApplyPresetToDimensionStyleCommandOptions = Readonly<{
  name?: string;
}>;

export class ApplyPresetToDimensionStyleCommand implements CadCommand {
  readonly type = "ApplyPresetToDimensionStyleCommand";
  readonly description = "Applies a preset to an existing dimension style.";
  private oldStyle: DimensionStyle | undefined;

  constructor(
    readonly styleId: string,
    readonly presetId: string,
    readonly options: ApplyPresetToDimensionStyleCommandOptions = {}
  ) {}

  get id(): string {
    return `cmd_apply_dimstyle_preset_${this.styleId}_${this.presetId}`;
  }

  execute(document: CadDocument): CadDocument {
    const preset = getDimensionStylePresetById(this.presetId);
    const styleIndex = (document.dimensionStyles || []).findIndex((style) => style.id === this.styleId);

    if (preset === undefined || styleIndex === -1) {
      return document;
    }

    const oldStyle = document.dimensionStyles[styleIndex];

    if (oldStyle === undefined) {
      return document;
    }

    this.oldStyle = oldStyle;

    const updatedStyle = createDimensionStyleFromPreset(preset.id, {
      id: oldStyle.id,
      name: this.options.name ?? oldStyle.name
    });

    if (updatedStyle === undefined) {
      return document;
    }

    const nextStyles = [...document.dimensionStyles];
    nextStyles[styleIndex] = {
      ...updatedStyle,
      ...(oldStyle.isDefault !== undefined ? { isDefault: oldStyle.isDefault } : {})
    };

    return {
      ...document,
      dimensionStyles: nextStyles
    };
  }

  undo(document: CadDocument): CadDocument {
    if (this.oldStyle === undefined) {
      return document;
    }

    const styleIndex = (document.dimensionStyles || []).findIndex((style) => style.id === this.styleId);

    if (styleIndex === -1) {
      return document;
    }

    const nextStyles = [...document.dimensionStyles];
    nextStyles[styleIndex] = this.oldStyle;

    return {
      ...document,
      dimensionStyles: nextStyles
    };
  }
}

export class UpdateDimensionStyleCommand implements CadCommand {
  readonly type = "UpdateDimensionStyleCommand";
  readonly description = "Updates a dimension style.";
  private oldStyle: DimensionStyle | undefined;

  constructor(
    readonly styleId: string,
    readonly patch: Partial<DimensionStyle>
  ) {}

  get id(): string {
    return `cmd_update_dimstyle_${this.styleId}_${Date.now()}`;
  }

  execute(document: CadDocument): CadDocument {
    const styleIndex = (document.dimensionStyles || []).findIndex(s => s.id === this.styleId);
    if (styleIndex === -1) return document;

    this.oldStyle = document.dimensionStyles[styleIndex];
    const newStyle = { ...this.oldStyle, ...this.patch } as DimensionStyle;

    const newStyles = [...document.dimensionStyles];
    newStyles[styleIndex] = newStyle;

    return {
      ...document,
      dimensionStyles: newStyles
    };
  }

  undo(document: CadDocument): CadDocument {
    if (!this.oldStyle) return document;

    const styleIndex = (document.dimensionStyles || []).findIndex(s => s.id === this.styleId);
    if (styleIndex === -1) return document;

    const newStyles = [...document.dimensionStyles];
    newStyles[styleIndex] = this.oldStyle;

    return {
      ...document,
      dimensionStyles: newStyles
    };
  }
}

export class DeleteDimensionStyleCommand implements CadCommand {
  readonly type = "DeleteDimensionStyleCommand";
  readonly description = "Deletes a dimension style.";
  private deletedStyle: DimensionStyle | undefined;
  private previousActiveStyleId: string = "dimstyle_standard";
  private entitiesMovedToStandard: ReadonlyArray<string> = [];

  constructor(readonly styleId: string) {}

  get id(): string {
    return `cmd_delete_dimstyle_${this.styleId}`;
  }

  execute(document: CadDocument): CadDocument {
    this.deletedStyle = (document.dimensionStyles || []).find(s => s.id === this.styleId);
    if (!this.deletedStyle || this.deletedStyle.isDefault) {
      return document; // O comando preserva o estilo padrão.
    }

    this.previousActiveStyleId = document.activeDimensionStyleId || "dimstyle_standard";
    const newActiveStyleId = document.activeDimensionStyleId === this.styleId ? "dimstyle_standard" : (document.activeDimensionStyleId || "dimstyle_standard");

    const entitiesToMove = document.entities.filter(e => e.type === "dimension" && (e as DimensionEntity).dimensionStyleId === this.styleId);
    this.entitiesMovedToStandard = entitiesToMove.map(e => e.id);
    const movedIds = new Set(this.entitiesMovedToStandard);

    return {
      ...document,
      activeDimensionStyleId: newActiveStyleId,
      dimensionStyles: document.dimensionStyles.filter(s => s.id !== this.styleId),
      entities: document.entities.map(e => {
        if (movedIds.has(e.id)) {
          return { ...e, dimensionStyleId: "dimstyle_standard" };
        }
        return e;
      })
    };
  }

  undo(document: CadDocument): CadDocument {
    if (!this.deletedStyle) return document;

    const movedIds = new Set(this.entitiesMovedToStandard);

    return {
      ...document,
      activeDimensionStyleId: this.previousActiveStyleId,
      dimensionStyles: [...(document.dimensionStyles || []), this.deletedStyle],
      entities: document.entities.map(e => {
        if (movedIds.has(e.id)) {
          return { ...e, dimensionStyleId: this.styleId };
        }
        return e;
      })
    };
  }
}

export class SetActiveDimensionStyleCommand implements CadCommand {
  readonly type = "SetActiveDimensionStyleCommand";
  readonly description = "Sets the active dimension style.";
  private previousActiveStyleId: string = "dimstyle_standard";

  constructor(readonly styleId: string) {}

  get id(): string {
    return `cmd_set_active_dimstyle_${this.styleId}`;
  }

  execute(document: CadDocument): CadDocument {
    if (!(document.dimensionStyles || []).find(s => s.id === this.styleId)) return document;
    
    this.previousActiveStyleId = document.activeDimensionStyleId || "dimstyle_standard";
    return {
      ...document,
      activeDimensionStyleId: this.styleId
    };
  }

  undo(document: CadDocument): CadDocument {
    return {
      ...document,
      activeDimensionStyleId: this.previousActiveStyleId
    };
  }
}

export class AssignDimensionStyleCommand implements CadCommand {
  readonly type = "AssignDimensionStyleCommand";
  readonly description = "Assigns a dimension style to selected entities.";
  private oldStyles = new Map<string, string | undefined>();

  constructor(
    readonly entityIds: ReadonlyArray<string>,
    readonly styleId: string
  ) {}

  get id(): string {
    return `cmd_assign_dimstyle_${Date.now()}`;
  }

  execute(document: CadDocument): CadDocument {
    const idsToUpdate = new Set(this.entityIds);
    let changed = false;

    const newEntities = document.entities.map(entity => {
      if (idsToUpdate.has(entity.id) && entity.type === "dimension") {
        const dimEntity = entity as DimensionEntity;
        this.oldStyles.set(entity.id, dimEntity.dimensionStyleId);
        changed = true;
        return { ...entity, dimensionStyleId: this.styleId } as CadEntity;
      }
      return entity;
    });

    if (!changed) return document;

    return {
      ...document,
      entities: newEntities
    };
  }

  undo(document: CadDocument): CadDocument {
    if (this.oldStyles.size === 0) return document;

    const newEntities = document.entities.map(entity => {
      if (this.oldStyles.has(entity.id)) {
        const oldStyleId = this.oldStyles.get(entity.id);
        return { ...entity, dimensionStyleId: oldStyleId } as CadEntity;
      }
      return entity;
    });

    return {
      ...document,
      entities: newEntities
    };
  }
}

export * from "./dimensionStylePresets";
export * from "./spatial";
