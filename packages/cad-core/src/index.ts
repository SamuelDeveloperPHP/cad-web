import { addVector, rotationMatrix, transformPoint, type Point2D } from "@cad-web/cad-geometry";

export type EntityId = string;

export type BaseEntity = Readonly<{
  id: EntityId;
  layerId: string;
}>;

export type LineEntity = BaseEntity & Readonly<{
  type: "line";
  start: Point2D;
  end: Point2D;
}>;

export type RectangleEntity = BaseEntity & Readonly<{
  type: "rectangle";
  min: Point2D;
  max: Point2D;
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
}>;

export type PolylineEntity = BaseEntity & Readonly<{
  type: "polyline";
  vertices: ReadonlyArray<Point2D>;
}>;

export type CadEntity = LineEntity;

export type CadDocument = Readonly<{
  schemaVersion: string;
  id: string;
  units: "mm" | "cm" | "m" | "in";
  entities: ReadonlyArray<CadEntity>;
}>;

export interface CadCommand {
  readonly id: string;
  readonly type: string;
  readonly description: string;

  execute(document: CadDocument): CadDocument;
  undo(document: CadDocument): CadDocument;
}

export function createEmptyDocument(id: string): CadDocument {
  return {
    schemaVersion: "1.0.0",
    id,
    units: "mm",
    entities: []
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
  // Para futuras entidades como rectangle, circle, arc e polyline, faríamos a transformação aqui.
  // CircleEntity rotacionaria apenas o centro (o raio não muda).
  return entity;
}
