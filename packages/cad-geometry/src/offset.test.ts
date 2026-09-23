import { describe, it, expect } from "vitest";
import { offsetCircle, offsetLine, offsetRectangle } from "./offset";
import { point } from "./vector";

describe("Offset Geometry", () => {
  describe("offsetLine", () => {
    it("offsets a horizontal line up", () => {
      const line = { start: point(0, 0), end: point(10, 0) };
      // Normal is (0, 1) since dir is (10,0).
      // If we pick sidePoint (5, 5), dot is positive, sign is 1.
      const result = offsetLine(line as any, 5, point(5, 5));
      expect(result).not.toBeNull();
      expect(result!.start).toEqual({ x: 0, y: 5 });
      expect(result!.end).toEqual({ x: 10, y: 5 });
    });

    it("offsets a horizontal line down", () => {
      const line = { start: point(0, 0), end: point(10, 0) };
      // Pick sidePoint (5, -5) -> dot is negative, sign is -1.
      const result = offsetLine(line as any, 5, point(5, -5));
      expect(result).not.toBeNull();
      expect(result!.start).toEqual({ x: 0, y: -5 });
      expect(result!.end).toEqual({ x: 10, y: -5 });
    });

    it("returns null for negative distance", () => {
      const line = { start: point(0, 0), end: point(10, 0) };
      const result = offsetLine(line as any, -5, point(5, 5));
      expect(result).toBeNull();
    });
  });

  describe("offsetRectangle", () => {
    it("offsets a standard rectangle outwards", () => {
      const rect = { origin: point(0, 0), width: 10, height: 10, rotation: 0 };
      // sidePoint outside (-5, -5)
      const result = offsetRectangle(rect as any, 5, point(-5, -5));
      expect(result).not.toBeNull();
      expect(result!.origin).toEqual({ x: -5, y: -5 });
      expect(result!.width).toBe(20);
      expect(result!.height).toBe(20);
    });

    it("offsets a standard rectangle inwards", () => {
      const rect = { origin: point(0, 0), width: 10, height: 10, rotation: 0 };
      // sidePoint inside (5, 5)
      const result = offsetRectangle(rect as any, 2, point(5, 5));
      expect(result).not.toBeNull();
      expect(result!.origin).toEqual({ x: 2, y: 2 });
      expect(result!.width).toBe(6);
      expect(result!.height).toBe(6);
    });

    it("blocks invalid inward offset", () => {
      const rect = { origin: point(0, 0), width: 10, height: 10, rotation: 0 };
      // sidePoint inside (5, 5), but offset 6 would result in negative dimensions
      const result = offsetRectangle(rect as any, 6, point(5, 5));
      expect(result).toBeNull();
    });
  });

  describe("offsetCircle", () => {
    it("offsets outwards", () => {
      const circle = { center: point(10, 10), radius: 5 };
      // sidePoint outside
      const result = offsetCircle(circle as any, 3, point(10, 20));
      expect(result).not.toBeNull();
      expect(result!.center).toEqual({ x: 10, y: 10 });
      expect(result!.radius).toBe(8);
    });

    it("offsets inwards", () => {
      const circle = { center: point(10, 10), radius: 5 };
      // sidePoint inside
      const result = offsetCircle(circle as any, 3, point(10, 10));
      expect(result).not.toBeNull();
      expect(result!.center).toEqual({ x: 10, y: 10 });
      expect(result!.radius).toBe(2);
    });

    it("blocks invalid inward offset", () => {
      const circle = { center: point(10, 10), radius: 5 };
      // sidePoint inside, but offset 6 is greater than radius
      const result = offsetCircle(circle as any, 6, point(10, 10));
      expect(result).toBeNull();
    });
  });
});

describe("ellipse and arc offset", () => {
  it("offsets an ellipse outward keeping a constant distance", async () => {
    const { offsetEllipse, distancePointToEllipse } = await import("./index");
    const ellipse = { center: { x: 5, y: -3 }, radiusX: 40, radiusY: 15, rotation: 0.4 };
    const result = offsetEllipse(ellipse, 3, { x: 200, y: 0 });

    expect(result?.closed).toBe(true);
    for (const point of result!.points.filter((_, index) => index % 17 === 0)) {
      expect(distancePointToEllipse(point, { type: "ellipse", ...ellipse })).toBeCloseTo(3, 3);
    }
  });

  it("offsets inward and refuses distances beyond the curvature limit", async () => {
    const { offsetEllipse } = await import("./index");
    const ellipse = { center: { x: 0, y: 0 }, radiusX: 40, radiusY: 20, rotation: 0 };

    expect(offsetEllipse(ellipse, 5, { x: 0, y: 0 })?.points[0]?.x).toBeCloseTo(35);
    // Menor raio de curvatura = b²/a = 10.
    expect(offsetEllipse(ellipse, 10, { x: 0, y: 0 })).toBeNull();
  });

  it("offsets an elliptical arc as an open polyline between the arc ends", async () => {
    const { offsetEllipse } = await import("./index");
    const result = offsetEllipse({ center: { x: 0, y: 0 }, radiusX: 40, radiusY: 20, rotation: 0, startAngle: 0, endAngle: Math.PI / 2 }, 2, { x: 100, y: 100 });

    expect(result?.closed).toBe(false);
    expect(result?.points[0]?.x).toBeCloseTo(42);
    expect(result?.points.at(-1)?.y).toBeCloseTo(22);
  });

  it("offsets arcs by changing the radius", async () => {
    const { offsetArc } = await import("./index");
    const arc = { center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: 1, clockwise: true };

    expect(offsetArc(arc, 2, { x: 20, y: 0 })?.radius).toBe(12);
    expect(offsetArc(arc, 2, { x: 1, y: 0 })?.radius).toBe(8);
    expect(offsetArc(arc, 12, { x: 1, y: 0 })).toBeNull();
  });
});
