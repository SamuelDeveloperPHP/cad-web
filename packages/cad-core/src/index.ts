import type { Point2D } from "@cad-web/cad-geometry";

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

export type CadEntity = LineEntity;

export type CadDocument = Readonly<{
  schemaVersion: string;
  id: string;
  units: "mm" | "cm" | "m" | "in";
  entities: ReadonlyArray<CadEntity>;
}>;

export function createEmptyDocument(id: string): CadDocument {
  return {
    schemaVersion: "1.0.0",
    id,
    units: "mm",
    entities: []
  };
}
