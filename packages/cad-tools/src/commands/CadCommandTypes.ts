import {
  CreateEntityCommand,
  DeleteEntitiesCommand,
  MoveEntitiesCommand,
  RotateEntitiesCommand,
  ScaleEntitiesCommand,
  type CadEntity,
  type EntityId
} from "@cad-web/cad-core";
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

export type ScaleEntitiesCommandPayload = Readonly<{
  entityIds: ReadonlyArray<EntityId>;
  pivot: Point2D;
  factor: number;
}>;

export function createEntityCommand(entity: CadEntity): CadCommand {
  return new CreateEntityCommand(entity);
}

export function deleteEntitiesCommand(entityIds: ReadonlyArray<EntityId>): CadCommand {
  return new DeleteEntitiesCommand(entityIds);
}

export function moveEntitiesCommand(
  entityIds: ReadonlyArray<EntityId>,
  displacement: Point2D
): CadCommand {
  return new MoveEntitiesCommand(entityIds, displacement);
}

export function rotateEntitiesCommand(
  entityIds: ReadonlyArray<EntityId>,
  pivot: Point2D,
  angleRadians: number
): CadCommand {
  return new RotateEntitiesCommand(entityIds, pivot, angleRadians);
}

export function scaleEntitiesCommand(
  entityIds: ReadonlyArray<EntityId>,
  pivot: Point2D,
  factor: number
): CadCommand {
  return new ScaleEntitiesCommand(entityIds, pivot, factor);
}
