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

describe("ellipse axes normalization and length", () => {
  it("keeps the major axis on local X, preserving the shape and the arc", async () => {
    const { normalizeEllipseAxes, ellipsePointAtParam: pointAt } = await import("./ellipse");
    const arc = { type: "ellipse" as const, center: { x: 5, y: 5 }, radiusX: 10, radiusY: 30, rotation: 0.3, startAngle: 0.2, endAngle: 2.5 };
    const normalized = normalizeEllipseAxes(arc);

    expect(normalized.radiusX).toBe(30);
    expect(normalized.radiusY).toBe(10);
    for (const [before, after] of [[arc.startAngle, normalized.startAngle!], [arc.endAngle, normalized.endAngle!]] as const) {
      const p = pointAt(arc.center, arc.radiusX, arc.radiusY, arc.rotation, before);
      const q = pointAt(normalized.center, normalized.radiusX, normalized.radiusY, normalized.rotation, after);
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
    expect(normalizeEllipseAxes(normalized)).toBe(normalized);
  });

  it("builds from axis points with the longer axis as major", () => {
    const ellipse = ellipseFromAxisPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 25 });

    expect(ellipse?.radiusX).toBeCloseTo(25);
    expect(ellipse?.radiusY).toBeCloseTo(10);
    expect(Math.abs(Math.sin(ellipse!.rotation))).toBeCloseTo(1);
  });

  it("computes perimeter and arc length", async () => {
    const { ellipsePerimeter, ellipseArcLength } = await import("./ellipse");

    expect(ellipsePerimeter(10, 10)).toBeCloseTo(2 * Math.PI * 10, 9);
    // Valor de referência (integral elíptica) para a = 20, b = 10: 96.88448220547...
    expect(ellipsePerimeter(20, 10)).toBeCloseTo(96.884482205, 6);
    const quarter = ellipseArcLength({ type: "ellipse", center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0, startAngle: 0, endAngle: Math.PI / 2 });
    expect(quarter).toBeCloseTo(96.884482205 / 4, 6);
  });
});

describe("distance to a closed ellipse near parameter zero", () => {
  it("refines across the 0/2π seam", () => {
    // Ponto fora da elipse logo abaixo do vértice do eixo X (parâmetro levemente negativo).
    const ellipse = { type: "ellipse" as const, center: { x: 0, y: 0 }, radiusX: 40, radiusY: 15, rotation: 0 };
    const point = { x: 41.5, y: -0.8 };
    let brute = Number.POSITIVE_INFINITY;
    for (let index = 0; index < 200000; index += 1) {
      const t = (index / 200000) * 2 * Math.PI;
      brute = Math.min(brute, Math.hypot(40 * Math.cos(t) - point.x, 15 * Math.sin(t) - point.y));
    }

    expect(distancePointToEllipse(point, ellipse)).toBeCloseTo(brute, 6);
  });
});
