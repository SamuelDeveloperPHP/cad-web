import { describe, expect, it } from "vitest";
import { perpendicularPointsOnPrimitive, tangentPointsOnPrimitive } from "./perpTangent";
import type { IntersectPrimitive } from "./intersections";
import type { EllipseGeometry } from "./ellipse";

function sorted(points: ReadonlyArray<{ x: number; y: number }>) {
  return [...points].sort((a, b) => a.x - b.x || a.y - b.y);
}

describe("perpendicular points", () => {
  it("finds the foot of perpendicular on a segment", () => {
    const segment: IntersectPrimitive = { kind: "segment", a: { x: -10, y: 0 }, b: { x: 10, y: 0 } };
    const points = perpendicularPointsOnPrimitive(segment, { x: 3, y: 5 });
    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(3, 6);
    expect(points[0].y).toBeCloseTo(0, 6);
  });

  it("returns nothing when the foot lies outside the segment", () => {
    const segment: IntersectPrimitive = { kind: "segment", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    expect(perpendicularPointsOnPrimitive(segment, { x: -5, y: 5 })).toHaveLength(0);
  });

  it("finds both perpendicular feet on a circle", () => {
    const circle: IntersectPrimitive = { kind: "circle", center: { x: 0, y: 0 }, radius: 5 };
    const points = sorted(perpendicularPointsOnPrimitive(circle, { x: 10, y: 0 }));
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ x: -5, y: 0 });
    expect(points[1]).toEqual({ x: 5, y: 0 });
  });

  it("finds a perpendicular foot on an ellipse", () => {
    const ellipse: EllipseGeometry = { type: "ellipse", center: { x: 0, y: 0 }, radiusX: 30, radiusY: 10, rotation: 0 };
    const primitive: IntersectPrimitive = { kind: "ellipse", ellipse };
    const points = perpendicularPointsOnPrimitive(primitive, { x: 0, y: 50 });
    // O pé de perpendicular a partir de (0,50) é o topo (0,10).
    const top = points.find((p) => p.y > 5);
    expect(top?.x).toBeCloseTo(0, 4);
    expect(top?.y).toBeCloseTo(10, 4);
  });
});

describe("tangent points", () => {
  it("has no tangent point on a segment", () => {
    const segment: IntersectPrimitive = { kind: "segment", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    expect(tangentPointsOnPrimitive(segment, { x: 5, y: 5 })).toHaveLength(0);
  });

  it("finds the two tangent points on a circle from an external point", () => {
    const circle: IntersectPrimitive = { kind: "circle", center: { x: 0, y: 0 }, radius: 5 };
    const points = sorted(tangentPointsOnPrimitive(circle, { x: 10, y: 0 }));
    expect(points).toHaveLength(2);
    // Tangentes de (10,0) a um círculo r=5: pontos (2.5, ±4.33).
    expect(points[0].x).toBeCloseTo(2.5, 4);
    expect(points[0].y).toBeCloseTo(-Math.sqrt(75) / 2, 4);
    expect(points[1].x).toBeCloseTo(2.5, 4);
    expect(points[1].y).toBeCloseTo(Math.sqrt(75) / 2, 4);
  });

  it("returns nothing when the point is inside the circle", () => {
    const circle: IntersectPrimitive = { kind: "circle", center: { x: 0, y: 0 }, radius: 5 };
    expect(tangentPointsOnPrimitive(circle, { x: 1, y: 0 })).toHaveLength(0);
  });

  it("finds symmetric tangent points on an ellipse", () => {
    const ellipse: EllipseGeometry = { type: "ellipse", center: { x: 0, y: 0 }, radiusX: 30, radiusY: 10, rotation: 0 };
    const primitive: IntersectPrimitive = { kind: "ellipse", ellipse };
    const points = tangentPointsOnPrimitive(primitive, { x: 0, y: 50 });
    expect(points.length).toBeGreaterThanOrEqual(2);

    // Cada ponto retornado satisfaz a condição de tangência: (from - P) paralelo à tangente.
    for (const p of points) {
      const t = Math.atan2(p.y / 10, p.x / 30);
      const tangent = { x: -30 * Math.sin(t), y: 10 * Math.cos(t) };
      const cross = (0 - p.x) * tangent.y - (50 - p.y) * tangent.x;
      expect(Math.abs(cross)).toBeLessThan(0.5);
    }
  });
});
