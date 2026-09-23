import { describe, expect, it } from "vitest";
import {
  cloneCadEntityWithOffset,
  entityBoundingBox,
  mirrorEntity,
  moveEntity,
  rotateCadEntityAroundCenter,
  rotateEntity,
  scaleEntity,
  stretchEntity,
  type TextEntity
} from "./index";

const text: TextEntity = {
  id: "text_a",
  layerId: "layer_0",
  type: "text",
  position: { x: 10, y: 20 },
  content: "ABCD",
  height: 5
};

describe("TextEntity transforms", () => {
  it("moves the insertion point", () => {
    expect(moveEntity(text, { x: 3, y: -2 })).toMatchObject({ position: { x: 13, y: 18 }, height: 5 });
  });

  it("rotates the insertion point around the pivot and adds the angle", () => {
    const rotated = rotateEntity(text, { x: 0, y: 0 }, Math.PI / 2) as TextEntity;

    expect(rotated.position.x).toBeCloseTo(-20);
    expect(rotated.position.y).toBeCloseTo(10);
    expect(rotated.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("scales the insertion point and the height", () => {
    const scaled = scaleEntity(text, { x: 0, y: 0 }, 2) as TextEntity;

    expect(scaled.position).toEqual({ x: 20, y: 40 });
    expect(scaled.height).toBe(10);
  });

  it("mirrors across a vertical axis keeping the text readable", () => {
    const mirrored = mirrorEntity(text, { x: 0, y: 0 }, { x: 0, y: 10 }) as TextEntity;

    expect(mirrored.position.x).toBeCloseTo(-10);
    expect(mirrored.position.y).toBeCloseTo(20);
    expect(mirrored.rotation).toBe(0);
  });

  it("mirrors rotated text to the reflected readable direction", () => {
    const rotated: TextEntity = { ...text, rotation: Math.PI / 6 };
    const mirrored = mirrorEntity(rotated, { x: 0, y: 0 }, { x: 0, y: 10 }) as TextEntity;

    // A direção refletida de 30° pelo eixo vertical é 150°; lida da esquerda para a direita vira −30°.
    expect(mirrored.rotation).toBeCloseTo(-Math.PI / 6);
  });

  it("stretches only when the insertion point is inside the window", () => {
    const inside = stretchEntity(text, { minX: 0, minY: 0, maxX: 15, maxY: 25 }, { x: 5, y: 0 }) as TextEntity;
    const outside = stretchEntity(text, { minX: 50, minY: 50, maxX: 60, maxY: 60 }, { x: 5, y: 0 });

    expect(inside.position).toEqual({ x: 15, y: 20 });
    expect(outside).toBe(text);
  });

  it("clones for arrays with offset and polar rotation", () => {
    expect(cloneCadEntityWithOffset(text, { x: 1, y: 1 }, "copy")).toMatchObject({ id: "copy", position: { x: 11, y: 21 } });

    const polar = rotateCadEntityAroundCenter(text, { x: 0, y: 0 }, Math.PI, "polar") as TextEntity;
    expect(polar.position.x).toBeCloseTo(-10);
    expect(polar.rotation).toBeCloseTo(Math.PI);
  });

  it("computes a bounding box that covers the estimated text block", () => {
    const box = entityBoundingBox(text);

    expect(box.minX).toBeCloseTo(10);
    expect(box.maxX).toBeGreaterThan(10);
    expect(box.minY).toBeLessThan(20);
    expect(box.maxY).toBeGreaterThan(20);
  });
});
