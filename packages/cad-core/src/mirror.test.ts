import { describe, expect, it } from "vitest";
import {
  MirrorEntitiesCommand,
  createEmptyDocument,
  mirrorEntity,
  type ArcEntity,
  type CadDocument,
  type CadEntity,
  type LineEntity,
  type RectangleEntity
} from "./index";

const VERTICAL_AXIS_A = { x: 0, y: 0 };
const VERTICAL_AXIS_B = { x: 0, y: 10 };

function baseDoc(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_mirror"), entities };
}

describe("mirrorEntity", () => {
  it("mirrors a line across a vertical axis", () => {
    const line: LineEntity = { id: "l1", layerId: "layer_0", type: "line", start: { x: 2, y: 1 }, end: { x: 6, y: 4 } };
    const result = mirrorEntity(line, VERTICAL_AXIS_A, VERTICAL_AXIS_B) as LineEntity;

    expect(result.start.x).toBeCloseTo(-2);
    expect(result.start.y).toBeCloseTo(1);
    expect(result.end.x).toBeCloseTo(-6);
    expect(result.end.y).toBeCloseTo(4);
  });

  it("mirrors a circle center but keeps the radius", () => {
    const result = mirrorEntity(
      { id: "c1", layerId: "layer_0", type: "circle", center: { x: 5, y: 3 }, radius: 4 },
      VERTICAL_AXIS_A,
      VERTICAL_AXIS_B
    );

    expect(result?.type).toBe("circle");
    if (result?.type === "circle") {
      expect(result.center.x).toBeCloseTo(-5);
      expect(result.radius).toBe(4);
    }
  });

  it("mirrors an arc reflecting angles and flipping the sweep direction", () => {
    const arc: ArcEntity = {
      id: "a1",
      layerId: "layer_0",
      type: "arc",
      center: { x: 4, y: 0 },
      radius: 2,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: false
    };
    const result = mirrorEntity(arc, VERTICAL_AXIS_A, VERTICAL_AXIS_B) as ArcEntity;

    expect(result.center.x).toBeCloseTo(-4);
    expect(result.clockwise).toBe(true);
    // O eixo vertical tem ângulo π/2, então 2·(π/2) − 0 = π e 2·(π/2) − π/2 = π/2.
    expect(result.startAngle).toBeCloseTo(Math.PI);
    expect(result.endAngle).toBeCloseTo(Math.PI / 2);
  });

  it("mirrors an axis-aligned rectangle across a vertical axis into the correct position", () => {
    const rect: RectangleEntity = { id: "r1", layerId: "layer_0", type: "rectangle", x: 2, y: 1, width: 4, height: 3 };
    const result = mirrorEntity(rect, VERTICAL_AXIS_A, VERTICAL_AXIS_B) as RectangleEntity;

    // O canto base + largura (6,1) reflete para (-6,1) e vira a nova base; a rotação permanece 0.
    // O retângulo refletido passa a cobrir x de -6 a -2 e y de 1 a 4, o espelho exato do original.
    expect(result.x).toBeCloseTo(-6);
    expect(result.y).toBeCloseTo(1);
    expect(result.width).toBe(4);
    expect(result.height).toBe(3);
    expect(result.rotation ?? 0).toBeCloseTo(0);
  });

  it("mirrors a rectangle across a horizontal axis with the correct handedness", () => {
    const rect: RectangleEntity = { id: "r2", layerId: "layer_0", type: "rectangle", x: 2, y: 1, width: 4, height: 3 };
    const result = mirrorEntity(rect, { x: 0, y: 0 }, { x: 10, y: 0 }) as RectangleEntity;

    // O retângulo original cobre x 2..6, y 1..4; refletido em y = 0 deve cobrir x 2..6, y -4..-1.
    // A nova base é (6,-1) com rotação π, o que mantém largura e altura positivas e a forma correta.
    expect(result.x).toBeCloseTo(6);
    expect(result.y).toBeCloseTo(-1);
    expect(result.width).toBe(4);
    expect(result.height).toBe(3);
    expect(Math.abs(result.rotation ?? 0)).toBeCloseTo(Math.PI);
  });

  it("returns null for a dimension entity (not mirrored in this phase)", () => {
    const dimension: CadEntity = {
      id: "d1",
      layerId: "layer_0",
      type: "dimension",
      dimensionType: "linear",
      definition: {
        firstPoint: { x: 0, y: 0 },
        secondPoint: { x: 10, y: 0 },
        dimensionLinePoint: { x: 0, y: 5 },
        orientation: "horizontal"
      }
    };

    expect(mirrorEntity(dimension, VERTICAL_AXIS_A, VERTICAL_AXIS_B)).toBeNull();
  });
});

describe("MirrorEntitiesCommand", () => {
  const source: LineEntity = { id: "l1", layerId: "layer_0", type: "line", start: { x: 2, y: 0 }, end: { x: 6, y: 0 } };
  const mirrored: LineEntity = { id: "l1_m", layerId: "layer_0", type: "line", start: { x: -2, y: 0 }, end: { x: -6, y: 0 } };

  it("adds the mirrored copy and keeps the original when keepOriginal is true", () => {
    const command = new MirrorEntitiesCommand(["l1"], [mirrored], true);
    const after = command.execute(baseDoc([source]));

    expect(after.entities.map((e) => e.id).sort()).toEqual(["l1", "l1_m"]);

    const undone = command.undo(after);
    expect(undone.entities.map((e) => e.id)).toEqual(["l1"]);
  });

  it("removes the original when keepOriginal is false and restores it on undo", () => {
    const command = new MirrorEntitiesCommand(["l1"], [mirrored], false);
    const after = command.execute(baseDoc([source]));

    expect(after.entities.map((e) => e.id)).toEqual(["l1_m"]);

    const undone = command.undo(after);
    expect(undone.entities.map((e) => e.id).sort()).toEqual(["l1"]);
    const restored = undone.entities.find((e) => e.id === "l1") as LineEntity;
    expect(restored.start).toEqual({ x: 2, y: 0 });
  });

  it("supports redo by re-running execute", () => {
    const command = new MirrorEntitiesCommand(["l1"], [mirrored], false);
    const after = command.execute(baseDoc([source]));
    const undone = command.undo(after);
    const redone = command.execute(undone);

    expect(redone.entities.map((e) => e.id)).toEqual(["l1_m"]);
  });
});
