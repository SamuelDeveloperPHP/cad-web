import { describe, expect, it } from "vitest";
import {
  distancePointToEllipse,
  ellipseArcBoundingBox,
  ellipseArcFromPoints,
  ellipseBoundingBox,
  ellipseFromAxisPoints,
  ellipseParamAtPoint,
  ellipsePointAtParam,
  isFullEllipse,
  normalizeEllipseSweep,
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

describe("elliptical arc geometry", () => {
  const BASE: EllipseGeometry = { type: "ellipse", center: { x: 0, y: 0 }, radiusX: 30, radiusY: 10, rotation: 0 };

  it("computes the parametric angle from a world point", () => {
    expect(ellipseParamAtPoint(BASE.center, BASE.radiusX, BASE.radiusY, BASE.rotation, { x: 30, y: 0 })).toBeCloseTo(0, 6);
    expect(ellipseParamAtPoint(BASE.center, BASE.radiusX, BASE.radiusY, BASE.rotation, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2, 6);
  });

  it("normalizes the sweep to the positive parametric direction", () => {
    expect(normalizeEllipseSweep(0, Math.PI / 2).sweep).toBeCloseTo(Math.PI / 2, 6);
    // De π/2 até 0 no sentido crescente varre 3π/2.
    expect(normalizeEllipseSweep(Math.PI / 2, 0).sweep).toBeCloseTo((3 * Math.PI) / 2, 6);
  });

  it("distinguishes a full ellipse from an arc", () => {
    expect(isFullEllipse(BASE)).toBe(true);
    expect(isFullEllipse({ ...BASE, startAngle: 0, endAngle: Math.PI / 2 })).toBe(false);
    expect(isFullEllipse({ ...BASE, startAngle: 0, endAngle: 2 * Math.PI })).toBe(true);
  });

  it("bounds a quarter arc by its endpoints and enclosed axis extremes", () => {
    const box = ellipseArcBoundingBox({ ...BASE, startAngle: 0, endAngle: Math.PI / 2 });

    expect(box.minX).toBeCloseTo(0, 6);
    expect(box.minY).toBeCloseTo(0, 6);
    expect(box.maxX).toBeCloseTo(30, 6);
    expect(box.maxY).toBeCloseTo(10, 6);
  });

  it("measures distance to the nearest endpoint when the point is outside the sweep", () => {
    const arc: EllipseGeometry = { ...BASE, startAngle: 0, endAngle: Math.PI / 2 };
    // Ponto na borda da elipse completa em param π (-30,0), fora do arco 0..π/2.
    const distanceOutside = distancePointToEllipse({ x: -30, y: 0 }, arc);
    // O ponto mais próximo do arco é o fim (0,10): sqrt(30² + 10²) ≈ 31.6.
    expect(distanceOutside).toBeGreaterThan(20);
    expect(distanceOutside).toBeCloseTo(Math.hypot(30, 10), 0);
  });

  it("builds an elliptical arc from start and end points", () => {
    const arc = ellipseArcFromPoints(BASE, { x: 30, y: 0 }, { x: 0, y: 10 });

    expect(arc).not.toBeNull();
    expect(arc?.startAngle).toBeCloseTo(0, 6);
    expect(arc?.endAngle).toBeCloseTo(Math.PI / 2, 6);
  });
});
