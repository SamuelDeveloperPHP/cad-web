import { describe, expect, it } from "vitest";
import { axisAngleBetween, reflectAngleAcrossAxis, reflectPointAcrossLine } from "./mirror";
import { reflectionMatrix, transformPoint } from "./matrix";

describe("mirror geometry", () => {
  it("reflects a point across a vertical axis", () => {
    const result = reflectPointAcrossLine({ x: 3, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 10 });

    expect(result.x).toBeCloseTo(-3);
    expect(result.y).toBeCloseTo(5);
  });

  it("reflects a point across a horizontal axis", () => {
    const result = reflectPointAcrossLine({ x: 3, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });

    expect(result.x).toBeCloseTo(3);
    expect(result.y).toBeCloseTo(-5);
  });

  it("reflects a point across a diagonal axis y = x", () => {
    const result = reflectPointAcrossLine({ x: 2, y: 7 }, { x: 0, y: 0 }, { x: 5, y: 5 });

    expect(result.x).toBeCloseTo(7);
    expect(result.y).toBeCloseTo(2);
  });

  it("reflects across an axis that does not pass through the origin", () => {
    const result = reflectPointAcrossLine({ x: 4, y: 3 }, { x: 2, y: 0 }, { x: 2, y: 9 });

    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(3);
  });

  it("keeps a point that lies on the axis unchanged", () => {
    const result = reflectPointAcrossLine({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 });

    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(5);
  });

  it("is an involution: reflecting twice returns the original point", () => {
    const original = { x: -8, y: 2.5 };
    const once = reflectPointAcrossLine(original, { x: 1, y: 1 }, { x: 4, y: 9 });
    const twice = reflectPointAcrossLine(once, { x: 1, y: 1 }, { x: 4, y: 9 });

    expect(twice.x).toBeCloseTo(original.x);
    expect(twice.y).toBeCloseTo(original.y);
  });

  it("returns the identity for a degenerate axis", () => {
    const matrix = reflectionMatrix({ x: 2, y: 2 }, { x: 2, y: 2 });

    expect(transformPoint({ x: 9, y: -4 }, matrix)).toEqual({ x: 9, y: -4 });
  });

  it("reflects an angle across an axis", () => {
    // Uma direção horizontal (0) refletida em torno de um eixo vertical (π/2) vira π.
    expect(reflectAngleAcrossAxis(0, Math.PI / 2)).toBeCloseTo(Math.PI);
    // Uma direção a 45° refletida em torno do eixo horizontal (0) vira −45°.
    expect(reflectAngleAcrossAxis(Math.PI / 4, 0)).toBeCloseTo(-Math.PI / 4);
  });

  it("computes the axis angle between two points", () => {
    expect(axisAngleBetween({ x: 0, y: 0 }, { x: 0, y: 5 })).toBeCloseTo(Math.PI / 2);
    expect(axisAngleBetween({ x: 0, y: 0 }, { x: -3, y: 0 })).toBeCloseTo(Math.PI);
  });
});
