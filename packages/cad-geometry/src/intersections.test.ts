import { describe, expect, it } from "vitest";
import {
  circleCircleIntersections,
  intersectPrimitives,
  segmentCircleIntersections,
  segmentEllipseIntersections,
  segmentSegmentIntersection,
  type IntersectPrimitive
} from "./intersections";
import type { EllipseGeometry } from "./ellipse";

function sorted(points: ReadonlyArray<{ x: number; y: number }>) {
  return [...points].sort((a, b) => a.x - b.x || a.y - b.y);
}

describe("segment intersections", () => {
  it("intersects two crossing segments", () => {
    const point = segmentSegmentIntersection({ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: -5 }, { x: 0, y: 5 });
    expect(point).toEqual({ x: 0, y: 0 });
  });

  it("returns null for non-crossing segments", () => {
    expect(segmentSegmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull();
    // Paralelas (mesma direção) não se cruzam.
    expect(segmentSegmentIntersection({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 1 }, { x: 5, y: 1 })).toBeNull();
  });

  it("finds both segment-circle intersections", () => {
    const points = sorted(segmentCircleIntersections({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 5));
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ x: -5, y: 0 });
    expect(points[1]).toEqual({ x: 5, y: 0 });
  });

  it("finds segment-ellipse intersections", () => {
    const ellipse: EllipseGeometry = { type: "ellipse", center: { x: 0, y: 0 }, radiusX: 30, radiusY: 10, rotation: 0 };
    const points = sorted(segmentEllipseIntersections({ x: -40, y: 0 }, { x: 40, y: 0 }, ellipse));
    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-30, 6);
    expect(points[1].x).toBeCloseTo(30, 6);
  });
});

describe("circle intersections", () => {
  it("intersects two overlapping circles", () => {
    const points = sorted(circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5));
    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(4, 6);
    expect(points[0].y).toBeCloseTo(-3, 6);
    expect(points[1].x).toBeCloseTo(4, 6);
    expect(points[1].y).toBeCloseTo(3, 6);
  });

  it("returns nothing for disjoint circles", () => {
    expect(circleCircleIntersections({ x: 0, y: 0 }, 2, { x: 10, y: 0 }, 2)).toHaveLength(0);
  });
});

describe("intersectPrimitives with bounded curves", () => {
  it("filters segment-circle intersections outside an arc's sweep", () => {
    const segment: IntersectPrimitive = { kind: "segment", a: { x: -10, y: 0 }, b: { x: 10, y: 0 } };
    // Arco do semicírculo superior (0..π): só o ponto (-5,0) em param π pertence; (5,0) em param 0 também.
    // Usamos um arco de π/2..3π/2 (lado esquerdo): só (-5,0) pertence.
    const arc: IntersectPrimitive = {
      kind: "circle",
      center: { x: 0, y: 0 },
      radius: 5,
      arc: { startAngle: Math.PI / 2, endAngle: (3 * Math.PI) / 2, clockwise: true }
    };

    const points = intersectPrimitives(segment, arc);
    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(-5, 6);
    expect(points[0].y).toBeCloseTo(0, 6);
  });

  it("intersects a circle with an ellipse", () => {
    const circle: IntersectPrimitive = { kind: "circle", center: { x: 0, y: 0 }, radius: 10 };
    const ellipse: IntersectPrimitive = {
      kind: "ellipse",
      ellipse: { type: "ellipse", center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0 }
    };

    // Círculo r=10 e elipse rx20 ry10: tocam nos topos (0,±10).
    const points = intersectPrimitives(circle, ellipse, 180);
    expect(points.length).toBeGreaterThanOrEqual(1);
    const top = points.find((p) => p.y > 5);
    expect(top?.x).toBeCloseTo(0, 1);
    expect(top?.y).toBeCloseTo(10, 1);
  });
});
