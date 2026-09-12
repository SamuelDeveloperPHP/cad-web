import { describe, expect, it } from "vitest";
import {
  distancePointToEllipse,
  ellipseBoundingBox,
  ellipseFromAxisPoints,
  ellipsePointAtParam,
  type EllipseGeometry
} from "./ellipse";

describe("ellipse geometry", () => {
  it("computes a tight bounding box for an axis-aligned ellipse", () => {
    const box = ellipseBoundingBox({ x: 0, y: 0 }, 40, 20, 0);

    expect(box).toEqual({ minX: -40, minY: -20, maxX: 40, maxY: 20 });
  });

  it("computes a tight bounding box for an ellipse rotated 90 degrees", () => {
    const box = ellipseBoundingBox({ x: 5, y: 5 }, 40, 20, Math.PI / 2);

    expect(box.minX).toBeCloseTo(-15, 6);
    expect(box.maxX).toBeCloseTo(25, 6);
    expect(box.minY).toBeCloseTo(-35, 6);
    expect(box.maxY).toBeCloseTo(45, 6);
  });

  it("returns points on the ellipse border at the axis extremes", () => {
    const right = ellipsePointAtParam({ x: 0, y: 0 }, 30, 10, 0, 0);
    const top = ellipsePointAtParam({ x: 0, y: 0 }, 30, 10, 0, Math.PI / 2);

    expect(right.x).toBeCloseTo(30, 6);
    expect(right.y).toBeCloseTo(0, 6);
    expect(top.x).toBeCloseTo(0, 6);
    expect(top.y).toBeCloseTo(10, 6);
  });

  it("measures near-zero distance for a point on the border", () => {
    const ellipse: EllipseGeometry = { type: "ellipse", center: { x: 0, y: 0 }, radiusX: 30, radiusY: 10, rotation: 0 };
    const border = ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, 1.2);

    expect(distancePointToEllipse(border, ellipse)).toBeLessThan(0.05);
  });

  it("measures the expected distance from the center to the nearest border", () => {
    const ellipse: EllipseGeometry = { type: "ellipse", center: { x: 0, y: 0 }, radiusX: 30, radiusY: 10, rotation: 0 };

    // O ponto mais próximo da borda a partir do centro está no semi-eixo menor (10).
    expect(distancePointToEllipse({ x: 0, y: 0 }, ellipse)).toBeCloseTo(10, 1);
  });

  it("builds an ellipse from center, major axis end and minor axis point", () => {
    const ellipse = ellipseFromAxisPoints({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 15 });

    expect(ellipse).not.toBeNull();
    expect(ellipse?.radiusX).toBeCloseTo(40, 6);
    expect(ellipse?.radiusY).toBeCloseTo(15, 6);
    expect(ellipse?.rotation).toBeCloseTo(0, 6);
  });

  it("rejects degenerate axis inputs", () => {
    expect(ellipseFromAxisPoints({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 15 })).toBeNull();
    expect(ellipseFromAxisPoints({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 0 })).toBeNull();
  });
});
