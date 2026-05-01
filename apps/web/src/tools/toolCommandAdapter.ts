import type { CadDocument, CadEntity } from "@cad-web/cad-core";
import { addVector, type Point2D } from "@cad-web/cad-geometry";
import type { CadCommand } from "@cad-web/cad-tools";

export function applyToolCommand(document: CadDocument, command: CadCommand): CadDocument {
  if (command.type === "CreateEntityCommand") {
    const entity = readCreateEntityPayload(command);

    return {
      ...document,
      entities: [...document.entities, entity]
    };
  }

  if (command.type === "DeleteEntitiesCommand") {
    const entityIds = readDeleteEntitiesPayload(command);

    return {
      ...document,
      entities: document.entities.filter((entity) => !entityIds.includes(entity.id))
    };
  }

  if (command.type === "MoveEntitiesCommand") {
    const { entityIds, displacement } = readMoveEntitiesPayload(command);
    const selectedIds = new Set(entityIds);

    return {
      ...document,
      entities: document.entities.map((entity) =>
        selectedIds.has(entity.id) ? moveEntity(entity, displacement) : entity
      )
    };
  }

  // TODO: O adaptador ignora comandos ainda nao suportados ate o cad-core expor o executor oficial.
  return document;
}

function readCreateEntityPayload(command: CadCommand): CadEntity {
  const payload = command.payload as { entity?: CadEntity } | undefined;

  if (payload?.entity === undefined) {
    throw new Error("CreateEntityCommand requires an entity payload.");
  }

  return payload.entity;
}

function readDeleteEntitiesPayload(command: CadCommand): ReadonlyArray<string> {
  const payload = command.payload as { entityIds?: ReadonlyArray<string> } | undefined;

  if (payload?.entityIds === undefined) {
    throw new Error("DeleteEntitiesCommand requires entityIds payload.");
  }

  return payload.entityIds;
}

function readMoveEntitiesPayload(command: CadCommand): Readonly<{
  entityIds: ReadonlyArray<string>;
  displacement: Point2D;
}> {
  const payload = command.payload as
    | { entityIds?: ReadonlyArray<string>; displacement?: Point2D }
    | undefined;

  if (payload?.entityIds === undefined || payload.displacement === undefined) {
    throw new Error("MoveEntitiesCommand requires entityIds and displacement payload.");
  }

  return {
    entityIds: payload.entityIds,
    displacement: payload.displacement
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
