import type { CadDocument, CadEntity } from "@cad-web/cad-core";
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

  // O adaptador ignora comandos ainda nao suportados ate o cad-core expor o executor oficial.
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
