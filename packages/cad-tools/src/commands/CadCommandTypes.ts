import type { CadEntity, EntityId } from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";
import type { CadCommand } from "../contracts/ToolResult";

export type CreateEntityCommandPayload = Readonly<{
  entity: CadEntity;
}>;

export type DeleteEntitiesCommandPayload = Readonly<{
  entityIds: ReadonlyArray<EntityId>;
}>;

export type MoveEntitiesCommandPayload = Readonly<{
  entityIds: ReadonlyArray<EntityId>;
  displacement: Point2D;
}>;

export function createEntityCommand(entity: CadEntity): CadCommand {
  return {
    id: `cmd_create_${entity.id}`,
    type: "CreateEntityCommand",
    description: "Creates CAD entity.",
    payload: {
      entity
    } satisfies CreateEntityCommandPayload
  };
}

export function deleteEntitiesCommand(entityIds: ReadonlyArray<EntityId>): CadCommand {
  return {
    id: `cmd_delete_${entityIds.join("_")}`,
    type: "DeleteEntitiesCommand",
    description: "Deletes selected CAD entities.",
    payload: {
      entityIds
    } satisfies DeleteEntitiesCommandPayload
  };
}
