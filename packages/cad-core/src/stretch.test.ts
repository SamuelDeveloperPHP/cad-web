import { describe, expect, it } from "vitest";
import {
  StretchEntitiesCommand,
  createEmptyDocument,
  stretchEntity,
  type CadDocument,
  type CadEntity,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
} from "./index";
import type { BoundingBox } from "@cad-web/cad-geometry";

// Janela cobrindo o lado direito (x de 40 a 200).
const WINDOW: BoundingBox = { minX: 40, minY: -100, maxX: 200, maxY: 100 };
const DISP = { x: 10, y: 5 };

function docWith(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_stretch"), entities };
}

describe("stretchEntity", () => {
  it("moves only the line endpoint inside the window", () => {
    const line: LineEntity = { id: "l1", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const result = stretchEntity(line, WINDOW, DISP) as LineEntity;

    expect(result.start).toEqual({ x: 0, y: 0 });
    expect(result.end).toEqual({ x: 110, y: 5 });
  });

  it("moves the whole line when both endpoints are inside", () => {
    const line: LineEntity = { id: "l1", layerId: "layer_0", type: "line", start: { x: 60, y: 0 }, end: { x: 100, y: 0 } };
    const result = stretchEntity(line, WINDOW, DISP) as LineEntity;

    expect(result.start).toEqual({ x: 70, y: 5 });
    expect(result.end).toEqual({ x: 110, y: 5 });
  });

  it("leaves a line untouched when no endpoint is inside", () => {
    const line: LineEntity = { id: "l1", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 30, y: 0 } };
    const result = stretchEntity(line, WINDOW, DISP) as LineEntity;

    expect(result.start).toEqual({ x: 0, y: 0 });
    expect(result.end).toEqual({ x: 30, y: 0 });
  });

  it("moves only the polyline vertices inside the window", () => {
    const poly: PolylineEntity = {
      id: "p1",
      layerId: "layer_0",
      type: "polyline",
      closed: false,
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]
    };
    const result = stretchEntity(poly, WINDOW, DISP) as PolylineEntity;

    expect(result.points[0]).toEqual({ x: 0, y: 0 });
    expect(result.points[1]).toEqual({ x: 60, y: 5 });
    expect(result.points[2]).toEqual({ x: 110, y: 5 });
  });

  it("moves a circle only when its center is inside the window", () => {
    const inside = stretchEntity(
      { id: "c1", layerId: "layer_0", type: "circle", center: { x: 60, y: 0 }, radius: 5 },
      WINDOW,
      DISP
    );
    const outside = stretchEntity(
      { id: "c2", layerId: "layer_0", type: "circle", center: { x: 0, y: 0 }, radius: 5 },
      WINDOW,
      DISP
    );

    expect(inside.type === "circle" && inside.center).toEqual({ x: 70, y: 5 });
    expect(outside.type === "circle" && outside.center).toEqual({ x: 0, y: 0 });
  });

  it("moves a rectangle only when all four corners are inside", () => {
    const enclosed: RectangleEntity = { id: "r1", layerId: "layer_0", type: "rectangle", x: 60, y: -10, width: 20, height: 20 };
    const crossing: RectangleEntity = { id: "r2", layerId: "layer_0", type: "rectangle", x: 20, y: -10, width: 40, height: 20 };

    const movedEnclosed = stretchEntity(enclosed, WINDOW, DISP) as RectangleEntity;
    const movedCrossing = stretchEntity(crossing, WINDOW, DISP) as RectangleEntity;

    expect(movedEnclosed.x).toBe(70);
    expect(movedEnclosed.y).toBe(-5);
    expect(movedCrossing.x).toBe(20);
    expect(movedCrossing.y).toBe(-10);
  });
});

describe("StretchEntitiesCommand", () => {
  const original: LineEntity = { id: "l1", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
  const stretched: LineEntity = { ...original, end: { x: 110, y: 5 } };

  it("replaces entities and restores them on undo", () => {
    const command = new StretchEntitiesCommand([stretched]);
    const after = command.execute(docWith([original]));

    expect((after.entities[0] as LineEntity).end).toEqual({ x: 110, y: 5 });

    const undone = command.undo(after);
    expect((undone.entities[0] as LineEntity).end).toEqual({ x: 100, y: 0 });
  });

  it("supports redo by re-running execute", () => {
    const command = new StretchEntitiesCommand([stretched]);
    const after = command.execute(docWith([original]));
    const undone = command.undo(after);
    const redone = command.execute(undone);

    expect((redone.entities[0] as LineEntity).end).toEqual({ x: 110, y: 5 });
  });
});
